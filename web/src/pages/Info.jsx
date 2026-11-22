import { MessageCircle } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { Empty } from '../components/ui'
import { useApp } from '../context/App'
import { pct } from '../lib/format'
import { openExternal } from '../lib/telegram'
import { HowItWorksStrip } from './Home'

function Doc({ title, updated = 'November 2026', children }) {
  return (
    <div className="page max-w-3xl pt-10">
      <h1 className="text-4xl font-bold">{title}</h1>
      <p className="mt-2 text-sm text-muted">Last updated {updated}</p>
      <div className="mt-8 space-y-5 leading-relaxed text-ink/85 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-2">{children}</div>
    </div>
  )
}

export function HowItWorks() {
  const { settings } = useApp()
  const f = settings?.fees || { seller_commission_bps: 1500, buyer_markup_bps: 1500 }
  return (
    <Doc title="How TicketNest works">
      <p>TicketNest is a small, independent marketplace where fans resell K-pop concert tickets to other fans. We review every listing, take the payment, and deliver the ticket to the buyer through Telegram.</p>
      <HowItWorksStrip markup={f.buyer_markup_bps} />
      <h2>Fees</h2>
      <ul>
        <li><b>Buyers</b> pay the seller's price plus a {pct(f.buyer_markup_bps)} marketplace fee. The full price is shown before you pay.</li>
        <li><b>Sellers</b> receive their listing price minus a {pct(f.seller_commission_bps)} commission. Example: a $100 listing pays the seller $85 and costs the buyer $115.</li>
      </ul>
      <h2>Payment</h2>
      <p>You pay with KHQR — scan the code with ABA or any Bakong-member banking app. Your order is confirmed only when the bank payment is matched to your order on our side. We never confirm an order from a screenshot. If your payment can't be matched automatically, our team checks it by hand.</p>
      <h2>Delivery</h2>
      <p>Tickets are delivered manually. After your payment is verified, a member of our team contacts you on Telegram and sends your ticket (for example the e-ticket PDF or an in-app transfer). Your order page shows when it has been delivered.</p>
      <h2>Getting paid as a seller</h2>
      <p>When a buyer pays, your earnings appear as pending in your wallet. Once the ticket is delivered, they become available and you can request a withdrawal to your bank account. Withdrawals are reviewed and paid by our team.</p>
    </Doc>
  )
}

const POLICIES = {
  authenticity: ['Ticket authenticity policy', () => (
    <>
      <p>TicketNest is a resale marketplace. Tickets are listed by individual sellers, not by artists, agencies, promoters or official ticket sellers, and TicketNest is not affiliated with any of them.</p>
      <h2>What we check</h2>
      <ul>
        <li>Every listing must include proof of the ticket (screenshots, photos or the ticket PDF). A person on our team reviews it before the listing can go on sale.</li>
        <li>We check that the concert, category, seat and quantity match the proof, and we may contact the seller for more information.</li>
        <li>Listings that look incomplete, altered or suspicious are rejected.</li>
      </ul>
      <h2>What we can't promise</h2>
      <p>Our review reduces risk but cannot guarantee that a ticket will be accepted at the venue. Organisers can change entry rules, cancel or reissue tickets, or restrict transfers. We do not describe any ticket as "guaranteed authentic".</p>
      <h2>If something goes wrong</h2>
      <p>If you can't use a ticket you bought on TicketNest, contact us on Telegram straight away with your order number. If we confirm the ticket was invalid or not delivered, you're covered by our refund policy, and the seller is not paid for that ticket.</p>
    </>
  )],
  refunds: ['Refund policy', () => (
    <>
      <h2>You will get a full refund when</h2>
      <ul>
        <li>The concert is cancelled and not rescheduled.</li>
        <li>We could not deliver your ticket before the event.</li>
        <li>We confirm that the ticket you received was invalid.</li>
      </ul>
      <h2>Postponed concerts</h2>
      <p>If a concert is postponed, your ticket normally remains valid for the new date. If you can't attend the new date, contact us — we'll try to resell your ticket for you, but a refund is not guaranteed.</p>
      <h2>Change of mind</h2>
      <p>Because tickets are unique and time-limited, we don't offer refunds if you change your mind after payment. You're welcome to list your ticket for resale on TicketNest.</p>
      <h2>How refunds are paid</h2>
      <p>Refunds are sent manually to the bank account you paid from (or another account you confirm with us), usually within 3 business days of approval. You'll receive an email and your order will show as Refunded.</p>
      <h2>Unpaid orders</h2>
      <p>Tickets are held for a limited time while you pay. If the QR code expires, the hold is released and no money is taken. If you paid after the QR expired, don't pay again — contact support with your bank receipt.</p>
    </>
  )],
  terms: ['Terms of use', () => (
    <>
      <p>By using TicketNest you agree to these terms. TicketNest is operated as a small independent business in Cambodia.</p>
      <h2>Buyers</h2>
      <ul>
        <li>Prices are set by sellers. The marketplace fee is shown before you pay.</li>
        <li>You must give a correct Telegram username so we can deliver your ticket.</li>
        <li>An order is only confirmed after your payment is verified.</li>
      </ul>
      <h2>Sellers</h2>
      <ul>
        <li>You may only list tickets you own and have the right to transfer, and you must not sell the same ticket elsewhere.</li>
        <li>All listings are reviewed before going live. We may reject or remove listings at any time.</li>
        <li>You must transfer the ticket when we ask. If a sale fails because of the seller, the buyer is refunded and the seller is not paid.</li>
        <li>Your earnings (listing price minus commission) are released after the ticket is delivered and can be withdrawn after review.</li>
      </ul>
      <h2>Prohibited</h2>
      <p>Fake or altered tickets, speculative listings for tickets you don't hold yet, and any attempt to pay or confirm payments dishonestly. We suspend accounts that break these rules.</p>
    </>
  )],
  privacy: ['Privacy policy', () => (
    <>
      <p>We collect only what we need to run the marketplace: your name, email, phone and Telegram username, your orders and listings, ticket proofs you upload, payout details you give us, and payment records from the bank.</p>
      <ul>
        <li>Ticket proofs and payout details are private: only you and TicketNest admins can see them.</li>
        <li>We use your Telegram username to deliver tickets and, if you start our bot, to send order updates.</li>
        <li>Emails are sent through our email provider; payments are processed by your bank via KHQR/Bakong.</li>
        <li>We don't sell your data. You can ask us to delete your account by messaging support, except records we must keep for accounting.</li>
      </ul>
    </>
  )],
}

export function Policy() {
  const { slug } = useParams()
  const p = POLICIES[slug]
  if (!p) return <div className="page pt-10"><Empty title="Page not found" /></div>
  const [title, Body] = p
  return <Doc title={title}><Body /></Doc>
}

export function Support() {
  const { settings } = useApp()
  const u = settings?.telegram?.support_username
  return (
    <div className="page max-w-xl pt-10">
      <h1 className="text-3xl font-bold">Support</h1>
      <p className="mt-3 text-muted">The fastest way to reach us is Telegram. Include your order or listing number so we can help quickly.</p>
      {u ? <button onClick={() => openExternal(`https://t.me/${u}`)} className="btn-accent mt-6 py-3"><MessageCircle className="h-4 w-4" />Message @{u}</button>
        : <p className="mt-6 text-sm text-muted">Support contact will be available soon.</p>}
      <div className="mt-10 space-y-2 text-sm">
        <Link className="block text-accent hover:underline" to="/policies/refunds">Refund policy</Link>
        <Link className="block text-accent hover:underline" to="/policies/authenticity">Ticket authenticity</Link>
      </div>
    </div>
  )
}

export function NotFound() {
  return <div className="page pt-16"><Empty title="Page not found" action={<Link to="/" className="btn-primary">Go home</Link>}>The page you're looking for doesn't exist.</Empty></div>
}
