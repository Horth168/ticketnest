"""Seller wallets. Every change is a WalletTransaction row with the balances after it.

  order paid       -> net earnings go to PENDING   (sale_pending)
  order delivered  -> pending moves to AVAILABLE   (sale_released)
  refund (before release) -> pending is removed    (sale_reversed)
  withdrawal request -> available moves to HELD     (withdrawal_hold)
  admin marks paid -> held is paid out              (withdrawal_paid)
  admin rejects    -> held returns to available     (withdrawal_returned)

Balances change with conditional UPDATEs (never below zero; a CHECK constraint too), and a UNIQUE
(wallet, type, order) means an order can only credit or release a seller once, even if a payment
notification or a button press arrives twice. Sellers can never change their own balances: the
only seller action is asking for a withdrawal of money that is already available.
"""
from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.models import Order, SellerWallet, User, WalletTransaction, WalletTxType, WithdrawalRequest
from app.services import audit

W = SellerWallet


def get_wallet(db: Session, user_id: int) -> SellerWallet:
    w = db.query(W).filter_by(user_id=user_id).first()
    if not w:
        w = W(user_id=user_id)
        db.add(w)
        db.flush()
    return w


def _record(db: Session, w: SellerWallet, type_: WalletTxType, amount: int, *, order_id=None, withdrawal_id=None,
            note="", actor: User | None = None) -> None:
    db.refresh(w)
    db.add(WalletTransaction(wallet_id=w.id, type=type_, amount_cents=amount, order_id=order_id,
                             withdrawal_id=withdrawal_id, available_after=w.available_cents,
                             pending_after=w.pending_cents, note=note, actor_id=actor.id if actor else None))
    db.flush()


def _done(db: Session, w: SellerWallet, type_: WalletTxType, order_id: int) -> bool:
    return db.query(WalletTransaction.id).filter_by(wallet_id=w.id, type=type_, order_id=order_id).first() is not None


def _sellers(order: Order) -> dict[int, int]:
    """seller_id -> net payout for this order (TicketNest's own stock has no seller)."""
    from app.utils import percent_of
    out: dict[int, int] = {}
    for it in order.items:
        if it.seller_id:
            unit_commission = percent_of(it.unit_price_cents, order.commission_bps)
            out[it.seller_id] = out.get(it.seller_id, 0) + (it.unit_price_cents - unit_commission) * it.quantity
    return out


def credit_pending(db: Session, order: Order) -> None:
    for seller_id, amount in _sellers(order).items():
        w = get_wallet(db, seller_id)
        if _done(db, w, WalletTxType.sale_pending, order.id):
            continue
        db.execute(update(W).where(W.id == w.id).values(pending_cents=W.pending_cents + amount)
                   .execution_options(synchronize_session=False))
        _record(db, w, WalletTxType.sale_pending, amount, order_id=order.id, note=f"{order.order_number} paid")


def release(db: Session, order: Order, actor: User | None = None) -> None:
    for seller_id, amount in _sellers(order).items():
        w = get_wallet(db, seller_id)
        if not _done(db, w, WalletTxType.sale_pending, order.id) or _done(db, w, WalletTxType.sale_released, order.id) \
                or _done(db, w, WalletTxType.sale_reversed, order.id):
            continue
        res = db.execute(update(W).where(W.id == w.id, W.pending_cents >= amount)
                         .values(pending_cents=W.pending_cents - amount, available_cents=W.available_cents + amount)
                         .execution_options(synchronize_session=False))
        if res.rowcount != 1:
            raise HTTPException(409, "Seller wallet is out of sync")
        _record(db, w, WalletTxType.sale_released, amount, order_id=order.id,
                note=f"{order.order_number} delivered", actor=actor)


def reverse(db: Session, order: Order, actor: User | None = None) -> None:
    """Refund: remove the seller's earnings for this order. If they were already released, they are
    taken back from the available balance; if the seller already withdrew them, the refund is refused
    so the owner can settle it with the seller first."""
    for seller_id, amount in _sellers(order).items():
        w = get_wallet(db, seller_id)
        if not _done(db, w, WalletTxType.sale_pending, order.id) or _done(db, w, WalletTxType.sale_reversed, order.id):
            continue
        if _done(db, w, WalletTxType.sale_released, order.id):
            res = db.execute(update(W).where(W.id == w.id, W.available_cents >= amount)
                             .values(available_cents=W.available_cents - amount)
                             .execution_options(synchronize_session=False))
        else:
            res = db.execute(update(W).where(W.id == w.id, W.pending_cents >= amount)
                             .values(pending_cents=W.pending_cents - amount)
                             .execution_options(synchronize_session=False))
        if res.rowcount != 1:
            raise HTTPException(409, "The seller has already withdrawn these earnings. Settle with the seller "
                                     "first, then record an adjustment.")
        _record(db, w, WalletTxType.sale_reversed, -amount, order_id=order.id,
                note=f"{order.order_number} refunded", actor=actor)


# ---------------------------------------------------------------- withdrawals
MIN_WITHDRAWAL = 500  # $5.00


def request_withdrawal(db: Session, user: User, amount: int, method: str, account_name: str,
                       account_number: str) -> WithdrawalRequest:
    if amount < MIN_WITHDRAWAL:
        raise HTTPException(400, "The minimum withdrawal is $5.00")
    w = get_wallet(db, user.id)
    res = db.execute(update(W).where(W.id == w.id, W.available_cents >= amount)
                     .values(available_cents=W.available_cents - amount, held_cents=W.held_cents + amount)
                     .execution_options(synchronize_session=False))
    if res.rowcount != 1:
        raise HTTPException(400, "Amount is more than your available balance")
    req = WithdrawalRequest(user_id=user.id, amount_cents=amount, method=method, account_name=account_name,
                            account_number=account_number)
    db.add(req)
    db.flush()
    _record(db, w, WalletTxType.withdrawal_hold, -amount, withdrawal_id=req.id, note=f"Withdrawal #{req.id}",
            actor=user)
    audit.log(db, "withdrawal.request", "withdrawal", req.id, actor=user, data={"amount_cents": amount})
    return req


def settle_withdrawal(db: Session, req: WithdrawalRequest, *, paid: bool, actor: User | None, label: str = "",
                      note: str = "", reference: str = "") -> None:
    from app.models import WithdrawalStatus
    from app.utils import utcnow
    if req.status != WithdrawalStatus.pending:
        raise HTTPException(409, f"This withdrawal is already {req.status.value}")
    w = get_wallet(db, req.user_id)
    if paid:
        res = db.execute(update(W).where(W.id == w.id, W.held_cents >= req.amount_cents)
                         .values(held_cents=W.held_cents - req.amount_cents,
                                 withdrawn_cents=W.withdrawn_cents + req.amount_cents)
                         .execution_options(synchronize_session=False))
        tx = WalletTxType.withdrawal_paid
    else:
        res = db.execute(update(W).where(W.id == w.id, W.held_cents >= req.amount_cents)
                         .values(held_cents=W.held_cents - req.amount_cents,
                                 available_cents=W.available_cents + req.amount_cents)
                         .execution_options(synchronize_session=False))
        tx = WalletTxType.withdrawal_returned
    if res.rowcount != 1:
        raise HTTPException(409, "Wallet is out of sync")
    req.status = WithdrawalStatus.paid if paid else WithdrawalStatus.rejected
    req.processed_by_id = actor.id if actor else None
    req.processed_at = utcnow()
    req.admin_note = note[:500]
    req.payout_reference = reference[:120]
    _record(db, w, tx, req.amount_cents, withdrawal_id=req.id,
            note=f"Withdrawal #{req.id} {'paid' if paid else 'rejected'}", actor=actor)
    audit.log(db, f"withdrawal.{'paid' if paid else 'rejected'}", "withdrawal", req.id, actor=actor, label=label,
              data={"amount_cents": req.amount_cents, "reference": reference})
