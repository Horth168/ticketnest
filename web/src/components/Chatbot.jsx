// Help chatbot: answers common questions instantly (English / Khmer / Chinese), finds concerts from the
// live catalogue when someone types an artist or concert name, and hands over to TicketNest's Telegram
// support for anything else. It runs entirely in the browser: no AI service or key is needed.
import { MessageCircle, Send, Sparkles, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/App'
import { useT } from '../i18n'
import { api } from '../lib/api'
import { cls, dateShort, usd } from '../lib/format'
import { openExternal } from '../lib/telegram'

// keywords in all three languages -> topic
const TOPICS = [
  ['buy', ['buy', 'purchase', 'how to buy', 'order', 'ទិញ', '买', '购买', '下单']],
  ['pay', ['pay', 'payment', 'khqr', 'aba', 'qr', 'bank', 'បង់', 'ទូទាត់', '付款', '支付', '付钱']],
  ['delivery', ['deliver', 'delivery', 'receive ticket', 'get my ticket', 'when ticket', 'ប្រគល់', 'ទទួលសំបុត្រ', '交付', '收到票', '发票给我', '送票']],
  ['sell', ['sell', 'list my', 'resell', 'លក់', '卖', '出售', '转让']],
  ['fees', ['fee', 'fees', 'commission', 'markup', 'cost', 'ថ្លៃសេវា', 'កម្រៃ', '费用', '手续费', '佣金']],
  ['refund', ['refund', 'cancel', 'money back', 'សងប្រាក់', 'បោះបង់', '退款', '取消']],
  ['legit', ['real', 'fake', 'legit', 'authentic', 'scam', 'safe', 'trust', 'ពិត', 'ក្លែងក្លាយ', 'សុវត្ថិភាព', '真', '假', '安全', '骗']],
  ['payout', ['withdraw', 'payout', 'get paid', 'when paid', 'wallet', 'ដកប្រាក់', 'ទទួលប្រាក់', 'កាបូប', '提现', '收款', '钱包', '什么时候收到钱']],
  ['order', ['my order', 'order status', 'track', 'ការបញ្ជាទិញ', 'ស្ថានភាព', '订单', '状态']],
  ['human', ['human', 'agent', 'support', 'contact', 'talk', 'help me', 'admin', 'មនុស្ស', 'ទំនាក់ទំនង', 'ជំនួយ', '人工', '客服', '联系']],
  ['hello', ['hi', 'hello', 'hey', 'សួស្តី', '你好', '您好']],
]

const ANSWERS = {
  hello: 'Hi! I can help you buy or sell K-pop concert tickets. Ask me anything, or type an artist name to find concerts.',
  buy: 'To buy: open a concert, pick a ticket and quantity, tap Buy, enter your Telegram username, then pay the KHQR code with your banking app. Your tickets are held for you while you pay.',
  pay: 'We accept KHQR: scan it with ABA, ACLEDA, Wing or any Bakong banking app and pay the exact amount. Your order turns Paid automatically once the bank confirms. On a phone, use "Save QR image" and scan it from your gallery.',
  delivery: 'After your payment is verified, our team contacts you on Telegram and sends your ticket — usually within 24 hours. Your order page shows when it has been delivered.',
  sell: 'To sell: tap Sell tickets, choose the concert and category, set your price, and upload your ticket proof and purchase receipt. Our team reviews it before it goes on sale.',
  fees: 'Buyers pay the seller\'s price plus a {markup} marketplace fee. Sellers receive their price minus a {commission} commission. Example: a $100 listing costs the buyer $115 and pays the seller $85.',
  refund: 'You get a full refund if the concert is cancelled, if we can\'t deliver your ticket, or if a ticket we sold is invalid. Change-of-mind refunds aren\'t possible, but you can resell your ticket here.',
  legit: 'Every listing is checked by our team: sellers upload the ticket proof and the purchase receipt before anything goes on sale. Payment is confirmed from the bank record, never from a screenshot.',
  payout: 'Sellers are paid when a buyer purchases the ticket and receives it — not when the listing is submitted. Your earnings then appear in your wallet and you can request a withdrawal to your bank.',
  order: 'You can see all your orders and their status under My account → My orders.',
  human: 'Sure — tap the button below to message our team on Telegram.',
  fallback: 'I\'m not sure about that one. Try the questions below, type an artist name, or message our team on Telegram.',
}

const QUICK = [['buy', 'How do I buy?'], ['pay', 'How do I pay?'], ['delivery', 'When do I get my ticket?'], ['sell', 'How do I sell?'],
  ['fees', 'What are the fees?'], ['payout', 'When do sellers get paid?'], ['refund', 'Refund policy'], ['human', 'Talk to a person']]

function topicOf(text) {
  const s = text.toLowerCase()
  for (const [topic, words] of TOPICS) if (words.some((w) => s.includes(w))) return topic
  return null
}

export default function Chatbot() {
  const { t } = useT()
  const { settings } = useApp()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState([])
  const [text, setText] = useState('')
  const [typing, setTyping] = useState(false)
  const end = useRef(null)
  const support = settings?.telegram?.support_username
  const fees = settings?.fees || { buyer_markup_bps: 1500, seller_commission_bps: 1500 }

  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, typing])
  useEffect(() => {
    if (open && !msgs.length) setMsgs([{ from: 'bot', text: t(ANSWERS.hello) }])
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const answer = (topic) => t(ANSWERS[topic] || ANSWERS.fallback, {
    markup: `${fees.buyer_markup_bps / 100}%`, commission: `${fees.seller_commission_bps / 100}%` })

  const ask = async (q, topicHint) => {
    if (!q.trim()) return
    setMsgs((m) => [...m, { from: 'me', text: q }])
    setText('')
    setTyping(true)
    const topic = topicHint || topicOf(q)
    let reply = { from: 'bot', text: answer(topic || 'fallback'), human: topic === 'human' || !topic }
    if (!topic && q.trim().length >= 2) {
      try {
        const r = await api(`/api/concerts?q=${encodeURIComponent(q.trim())}&size=4`)
        if (r.items.length) reply = { from: 'bot', text: t('Here\'s what I found:'), concerts: r.items }
      } catch { /* keep the fallback */ }
    }
    setTimeout(() => { setTyping(false); setMsgs((m) => [...m, reply]) }, 450)
  }

  return (
    <>
      <button onClick={() => setOpen((o) => !o)} aria-label={t('Help chat')}
        className={cls('fixed bottom-[calc(20px+var(--safe-bottom))] right-5 z-[70] grid h-14 w-14 place-items-center rounded-full bg-accent text-accent-ink shadow-[0_12px_32px_-8px_rgb(var(--accent)/.8)] transition-all duration-300 hover:scale-105 active:scale-95',
          open && 'rotate-90')}>
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>
      {open && (
        <div className="pop fixed bottom-[calc(88px+var(--safe-bottom))] right-3 z-[70] flex h-[min(560px,calc(100vh-120px))] w-[calc(100vw-24px)] max-w-[380px] flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-lift sm:right-5">
          <div className="flex items-center gap-3 border-b border-line bg-ink px-4 py-3.5 text-bg">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-accent text-accent-ink"><Sparkles className="h-4 w-4" /></span>
            <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{t('TicketNest help')}</p><p className="text-[12px] text-bg/60">{t('Usually answers instantly')}</p></div>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {msgs.map((m, i) => (
              <div key={i} className={cls('rise flex', m.from === 'me' ? 'justify-end' : 'justify-start')}>
                <div className={cls('max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed', m.from === 'me' ? 'rounded-br-md bg-accent text-accent-ink' : 'rounded-bl-md bg-raised')}>
                  {m.text}
                  {m.concerts && (
                    <div className="mt-2 space-y-1.5">
                      {m.concerts.map((c) => (
                        <button key={c.id} onClick={() => { setOpen(false); nav(`/concerts/${c.slug}`) }}
                          className="block w-full rounded-xl bg-surface px-3 py-2 text-left text-[13px] transition hover:bg-bg">
                          <b>{c.title}</b><span className="block text-muted">{c.city} · {dateShort(c.starts_at)} · {c.tickets_available ? `${t('from')} ${usd(c.from_price_cents)}` : t('SOLD OUT')}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {m.human && support && (
                    <button onClick={() => openExternal(`https://t.me/${support}`)} className="btn-accent mt-2.5 w-full py-2 text-[13px]">
                      <MessageCircle className="h-4 w-4" />{t('Message us on Telegram')}
                    </button>
                  )}
                </div>
              </div>
            ))}
            {typing && <div className="flex gap-1 px-2">{[0, 1, 2].map((i) => <span key={i} className="twinkle h-2 w-2 rounded-full bg-muted" style={{ animationDelay: `${i * 0.2}s` }} />)}</div>}
            <div ref={end} />
          </div>
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto border-t border-line px-3 py-2.5">
            {QUICK.map(([topic, label]) => (
              <button key={topic} onClick={() => ask(t(label), topic)} className="chip shrink-0 py-1 text-[12px]">{t(label)}</button>
            ))}
          </div>
          <form className="flex gap-2 border-t border-line p-3" onSubmit={(e) => { e.preventDefault(); ask(text) }}>
            <input className="input py-2" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('Ask a question or type an artist')} />
            <button className="btn-accent px-3" aria-label={t('Send')}><Send className="h-4 w-4" /></button>
          </form>
        </div>
      )}
    </>
  )
}
