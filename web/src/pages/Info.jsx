import { MessageCircle } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { Reveal } from '../components/Motion'
import { Empty } from '../components/ui'
import { useApp, useLink } from '../context/App'
import { useT } from '../i18n'
import { pct } from '../lib/format'
import { openExternal } from '../lib/telegram'
import { HowItWorksStrip } from './Home'

// Long texts are kept here per language (blocks: p = paragraph, h = heading, ul = list).
const DOCS = {
  authenticity: {
    en: ['Ticket authenticity policy', [
      ['p', 'TicketNest is a resale marketplace. Tickets are listed by individual sellers, not by artists, agencies, promoters or official ticket sellers, and TicketNest is not affiliated with any of them.'],
      ['h', 'What we check'],
      ['ul', ['Every listing must include proof of the ticket and the purchase receipt from the official seller. A person on our team reviews both before the listing can go on sale.',
        'We check that the concert, category, seat, quantity and original price match the proof and receipt, and we may contact the seller for more information.',
        'Listings that look incomplete, altered or suspicious are rejected.']],
      ['h', "What we can't promise"],
      ['p', 'Our review reduces risk but cannot guarantee that a ticket will be accepted at the venue. Organisers can change entry rules, cancel or reissue tickets, or restrict transfers. We do not describe any ticket as "guaranteed authentic".'],
      ['h', 'If something goes wrong'],
      ['p', "If you can't use a ticket you bought on TicketNest, contact us on Telegram straight away with your order number. If we confirm the ticket was invalid or not delivered, you're covered by our refund policy, and the seller is not paid for that ticket."],
    ]],
    km: ['គោលការណ៍ភាពពិតនៃសំបុត្រ', [
      ['p', 'TicketNest គឺជាទីផ្សារលក់បន្ត។ សំបុត្រត្រូវបានដាក់លក់ដោយអ្នកលក់ម្នាក់ៗ មិនមែនដោយសិល្បករ ក្រុមហ៊ុន អ្នករៀបចំ ឬអ្នកលក់សំបុត្រផ្លូវការទេ ហើយ TicketNest មិនមានទំនាក់ទំនងជាមួយពួកគេឡើយ។'],
      ['h', 'អ្វីដែលយើងពិនិត្យ'],
      ['ul', ['ការដាក់លក់នីមួយៗត្រូវមានភស្តុតាងសំបុត្រ និងបង្កាន់ដៃទិញពីអ្នកលក់ផ្លូវការ។ ក្រុមការងាររបស់យើងពិនិត្យទាំងពីរ មុនពេលដាក់លក់។',
        'យើងពិនិត្យថាការប្រគុំតន្ត្រី ប្រភេទ កៅអី ចំនួន និងតម្លៃដើម ត្រូវគ្នានឹងភស្តុតាង និងបង្កាន់ដៃ ហើយយើងអាចទាក់ទងអ្នកលក់ដើម្បីសុំព័ត៌មានបន្ថែម។',
        'ការដាក់លក់ដែលមិនពេញលេញ ត្រូវបានកែប្រែ ឬគួរឱ្យសង្ស័យ នឹងត្រូវបដិសេធ។']],
      ['h', 'អ្វីដែលយើងមិនអាចធានា'],
      ['p', 'ការពិនិត្យរបស់យើងកាត់បន្ថយហានិភ័យ ប៉ុន្តែមិនអាចធានាថាសំបុត្រនឹងត្រូវទទួលយកនៅកន្លែងប្រគុំតន្ត្រីបានទេ។ អ្នករៀបចំអាចផ្លាស់ប្តូរច្បាប់ចូល លុបចោល ឬចេញសំបុត្រថ្មី។ យើងមិនហៅសំបុត្រណាមួយថា "ធានាពិតប្រាកដ" ទេ។'],
      ['h', 'ប្រសិនបើមានបញ្ហា'],
      ['p', 'ប្រសិនបើអ្នកមិនអាចប្រើសំបុត្រដែលបានទិញ សូមទាក់ទងយើងតាម Telegram ភ្លាមៗ ជាមួយលេខការបញ្ជាទិញ។ ប្រសិនបើយើងបញ្ជាក់ថាសំបុត្រមិនត្រឹមត្រូវ ឬមិនបានប្រគល់ អ្នកនឹងទទួលបានសំណងតាមគោលការណ៍សងប្រាក់ ហើយអ្នកលក់មិនទទួលបានប្រាក់ទេ។'],
    ]],
    zh: ['票务真实性政策', [
      ['p', 'TicketNest 是一个转售平台。门票由个人卖家发布，而非艺人、经纪公司、主办方或官方售票方，TicketNest 与他们均无关联。'],
      ['h', '我们审核什么'],
      ['ul', ['每个挂单都必须提供门票凭证和官方购票收据。我们的团队会在上架前人工审核两者。',
        '我们核对演唱会、票区、座位、数量和原价是否与凭证和收据一致，必要时会联系卖家补充信息。',
        '信息不完整、被修改或可疑的挂单将被拒绝。']],
      ['h', '我们无法保证的'],
      ['p', '审核能降低风险，但无法保证门票一定能入场。主办方可能更改入场规则、取消或重新发票，或限制转让。我们不会将任何门票描述为“保证真实”。'],
      ['h', '如果出现问题'],
      ['p', '如果您在 TicketNest 购买的门票无法使用，请立即带上订单号通过 Telegram 联系我们。如经确认门票无效或未交付，您将按退款政策获得保障，卖家也不会收到该票款。'],
    ]],
  },
  refunds: {
    en: ['Refund policy', [
      ['h', 'You will get a full refund when'],
      ['ul', ['The concert is cancelled and not rescheduled.', 'We could not deliver your ticket before the event.', 'We confirm that the ticket you received was invalid.']],
      ['h', 'Postponed concerts'],
      ['p', "If a concert is postponed, your ticket normally remains valid for the new date. If you can't attend the new date, contact us — we'll try to resell your ticket for you, but a refund is not guaranteed."],
      ['h', 'Change of mind'],
      ['p', "Because tickets are unique and time-limited, we don't offer refunds if you change your mind after payment. You're welcome to list your ticket for resale on TicketNest."],
      ['h', 'How refunds are paid'],
      ['p', 'Refunds are sent manually to the bank account you paid from (or another account you confirm with us), usually within 3 business days of approval. You will receive an email and your order will show as Refunded.'],
      ['h', 'Unpaid orders'],
      ['p', "Tickets are held for a limited time while you pay. If the QR code expires, the hold is released and no money is taken. If you paid after the QR expired, don't pay again — contact support with your bank receipt."],
    ]],
    km: ['គោលការណ៍សងប្រាក់', [
      ['h', 'អ្នកនឹងទទួលបានការសងប្រាក់ពេញលេញ នៅពេល'],
      ['ul', ['ការប្រគុំតន្ត្រីត្រូវបានលុបចោល ហើយមិនកំណត់ថ្ងៃថ្មី។', 'យើងមិនអាចប្រគល់សំបុត្ររបស់អ្នកមុនកម្មវិធីបាន។', 'យើងបញ្ជាក់ថាសំបុត្រដែលអ្នកទទួលបានមិនត្រឹមត្រូវ។']],
      ['h', 'ការប្រគុំតន្ត្រីដែលពន្យារពេល'],
      ['p', 'ប្រសិនបើកម្មវិធីត្រូវបានពន្យារពេល សំបុត្ររបស់អ្នកជាទូទៅនៅតែមានសុពលភាពសម្រាប់ថ្ងៃថ្មី។ ប្រសិនបើអ្នកមិនអាចទៅបាន សូមទាក់ទងយើង — យើងនឹងព្យាយាមលក់បន្តឱ្យអ្នក ប៉ុន្តែមិនធានាការសងប្រាក់ទេ។'],
      ['h', 'ការប្តូរចិត្ត'],
      ['p', 'ដោយសារសំបុត្រមានតែមួយ និងមានកំណត់ពេល យើងមិនសងប្រាក់ទេ ប្រសិនបើអ្នកប្តូរចិត្តបន្ទាប់ពីបង់ប្រាក់។ អ្នកអាចដាក់លក់សំបុត្របន្តនៅលើ TicketNest បាន។'],
      ['h', 'របៀបសងប្រាក់'],
      ['p', 'ប្រាក់សងត្រូវបានផ្ញើដោយដៃទៅគណនីដែលអ្នកបានបង់ (ឬគណនីផ្សេងដែលអ្នកបញ្ជាក់ជាមួយយើង) ជាធម្មតាក្នុងរយៈពេល 3 ថ្ងៃធ្វើការ។ អ្នកនឹងទទួលអ៊ីមែល ហើយការបញ្ជាទិញនឹងបង្ហាញថា "បានសងប្រាក់"។'],
      ['h', 'ការបញ្ជាទិញមិនទាន់បង់'],
      ['p', 'សំបុត្រត្រូវបានរក្សាទុកសម្រាប់អ្នកក្នុងរយៈពេលកំណត់ពេលបង់ប្រាក់។ ប្រសិនបើ QR ផុតកំណត់ សំបុត្រនឹងត្រូវដោះលែង ហើយគ្មានប្រាក់ត្រូវកាត់ទេ។ ប្រសិនបើអ្នកបានបង់បន្ទាប់ពី QR ផុតកំណត់ សូមកុំបង់ម្តងទៀត — សូមទាក់ទងផ្នែកជំនួយជាមួយបង្កាន់ដៃធនាគារ។'],
    ]],
    zh: ['退款政策', [
      ['h', '以下情况可获得全额退款'],
      ['ul', ['演唱会取消且未改期。', '我们未能在演出前交付您的门票。', '我们确认您收到的门票无效。']],
      ['h', '演唱会延期'],
      ['p', '演唱会延期时，您的门票通常仍适用于新日期。如您无法参加新日期，请联系我们——我们会尽量帮您转售，但不保证退款。'],
      ['h', '改变主意'],
      ['p', '由于门票具有唯一性和时效性，付款后因个人原因改变主意不予退款。您可以在 TicketNest 上转售您的门票。'],
      ['h', '退款方式'],
      ['p', '退款会人工转入您付款的银行账户（或您与我们确认的其他账户），通常在批准后 3 个工作日内完成。您会收到邮件，订单将显示为“已退款”。'],
      ['h', '未付款订单'],
      ['p', '付款期间门票会为您保留一段时间。二维码过期后门票会被释放，不会扣款。如果您在二维码过期后才付款，请不要重复付款——请携带银行收据联系客服。'],
    ]],
  },
  terms: {
    en: ['Terms of use', [
      ['p', 'By using TicketNest you agree to these terms. TicketNest is operated as a small independent business in Cambodia.'],
      ['h', 'Buyers'],
      ['ul', ['Prices are set by sellers. The marketplace fee is shown before you pay.', 'You must give a correct Telegram username so we can deliver your ticket.', 'An order is only confirmed after your payment is verified.']],
      ['h', 'Sellers'],
      ['ul', ['You may only list tickets you own and have the right to transfer, and you must not sell the same ticket elsewhere.',
        'You must upload a genuine ticket proof and purchase receipt. All listings are reviewed before going live, and we may reject or remove listings at any time.',
        'You must transfer the ticket when we ask. If a sale fails because of the seller, the buyer is refunded and the seller is not paid.',
        'You are paid after the concert, not when a buyer buys your ticket. Your earnings (listing price minus commission) reach your wallet 24 to 48 hours after the concert ends, once the buyer has the ticket and has not reported a problem. You can then request a withdrawal.']],
      ['h', 'Prohibited'],
      ['p', "Fake or altered tickets or receipts, speculative listings for tickets you don't hold yet, and any attempt to pay or confirm payments dishonestly. We suspend accounts that break these rules."],
    ]],
    km: ['លក្ខខណ្ឌប្រើប្រាស់', [
      ['p', 'ដោយប្រើ TicketNest អ្នកយល់ព្រមលើលក្ខខណ្ឌទាំងនេះ។ TicketNest ដំណើរការជាអាជីវកម្មឯករាជ្យខ្នាតតូចនៅកម្ពុជា។'],
      ['h', 'អ្នកទិញ'],
      ['ul', ['តម្លៃកំណត់ដោយអ្នកលក់។ ថ្លៃសេវាទីផ្សារត្រូវបង្ហាញមុនពេលអ្នកបង់ប្រាក់។', 'អ្នកត្រូវផ្តល់ឈ្មោះ Telegram ត្រឹមត្រូវ ដើម្បីយើងប្រគល់សំបុត្រ។', 'ការបញ្ជាទិញត្រូវបានបញ្ជាក់ តែបន្ទាប់ពីការបង់ប្រាក់ត្រូវបានផ្ទៀងផ្ទាត់។']],
      ['h', 'អ្នកលក់'],
      ['ul', ['អ្នកអាចដាក់លក់តែសំបុត្រដែលជារបស់អ្នក និងមានសិទ្ធិផ្ទេរ ហើយមិនត្រូវលក់សំបុត្រដដែលនៅកន្លែងផ្សេង។',
        'អ្នកត្រូវផ្ញើភស្តុតាងសំបុត្រ និងបង្កាន់ដៃទិញពិតប្រាកដ។ ការដាក់លក់ទាំងអស់ត្រូវពិនិត្យមុនពេលបង្ហាញ ហើយយើងអាចបដិសេធ ឬដកចេញគ្រប់ពេល។',
        'អ្នកត្រូវផ្ទេរសំបុត្រនៅពេលយើងស្នើ។ ប្រសិនបើការលក់បរាជ័យដោយសារអ្នកលក់ អ្នកទិញនឹងទទួលប្រាក់វិញ ហើយអ្នកលក់មិនទទួលប្រាក់ទេ។',
        'អ្នកទទួលបានប្រាក់បន្ទាប់ពីការប្រគុំតន្ត្រី មិនមែនពេលអ្នកទិញទិញសំបុត្ររបស់អ្នកទេ។ ប្រាក់ចំណូល (តម្លៃដាក់លក់ដកកម្រៃជើងសារ) ចូលកាបូបរបស់អ្នក ២៤ ទៅ ៤៨ ម៉ោងបន្ទាប់ពីការប្រគុំតន្ត្រីបញ្ចប់ នៅពេលអ្នកទិញមានសំបុត្រ ហើយមិនបានរាយការណ៍បញ្ហា។ បន្ទាប់មកអ្នកអាចស្នើដកប្រាក់បាន។']],
      ['h', 'ហាមឃាត់'],
      ['p', 'សំបុត្រ ឬបង្កាន់ដៃក្លែងក្លាយ ឬកែប្រែ ការដាក់លក់សំបុត្រដែលអ្នកមិនទាន់មាន និងការប៉ុនប៉ងបង់ ឬបញ្ជាក់ការបង់ប្រាក់ដោយមិនស្មោះត្រង់។ យើងនឹងផ្អាកគណនីដែលបំពានច្បាប់ទាំងនេះ។'],
    ]],
    zh: ['使用条款', [
      ['p', '使用 TicketNest 即表示您同意以下条款。TicketNest 是在柬埔寨经营的独立小型企业。'],
      ['h', '买家'],
      ['ul', ['价格由卖家设定。付款前会显示平台服务费。', '您必须提供正确的 Telegram 用户名，以便我们交付门票。', '订单仅在付款核实后才会确认。']],
      ['h', '卖家'],
      ['ul', ['您只能出售您拥有且有权转让的门票，且不得在其他地方出售同一张票。',
        '您必须上传真实的门票凭证和购票收据。所有挂单上架前都会审核，我们可随时拒绝或下架。',
        '我们要求时您必须转让门票。如因卖家原因交易失败，买家将获得退款，卖家不会收到款项。',
        '您的收款时间是在演唱会结束后，而不是买家购票时。收益（挂单价减去佣金）会在演唱会结束后 24 至 48 小时内进入您的钱包，前提是买家已收到门票且未报告问题。之后您即可申请提现。']],
      ['h', '禁止行为'],
      ['p', '伪造或篡改门票或收据、出售尚未持有的门票，以及任何不诚实的付款或确认付款行为。违反规则的账户将被停用。'],
    ]],
  },
  privacy: {
    en: ['Privacy policy', [
      ['p', 'We collect only what we need to run the marketplace: your name, email, phone and Telegram username, your orders and listings, ticket proofs and receipts you upload, payout details and payout QR you give us, and payment records from the bank.'],
      ['ul', ['Ticket proofs, receipts and payout details are private: only you and TicketNest admins can see them.',
        'We use your Telegram username to deliver tickets and, if you start our bot, to send order updates.',
        'Emails are sent through our email provider; payments are processed by your bank via KHQR / Bakong.',
        "We don't sell your data. You can ask us to delete your account by messaging support, except records we must keep for accounting."]],
    ]],
    km: ['គោលការណ៍ឯកជនភាព', [
      ['p', 'យើងប្រមូលតែព័ត៌មានចាំបាច់ៈ ឈ្មោះ អ៊ីមែល លេខទូរស័ព្ទ ឈ្មោះ Telegram ការបញ្ជាទិញ និងការដាក់លក់ ភស្តុតាងសំបុត្រ និងបង្កាន់ដៃដែលអ្នកផ្ញើ ព័ត៌មានទទួលប្រាក់ និង QR របស់អ្នក និងកំណត់ត្រាការបង់ប្រាក់ពីធនាគារ។'],
      ['ul', ['ភស្តុតាងសំបុត្រ បង្កាន់ដៃ និងព័ត៌មានទទួលប្រាក់ ជាឯកជនៈ មានតែអ្នក និងអ្នកគ្រប់គ្រង TicketNest ប៉ុណ្ណោះដែលមើលឃើញ។',
        'យើងប្រើឈ្មោះ Telegram ដើម្បីប្រគល់សំបុត្រ និងផ្ញើព័ត៌មានការបញ្ជាទិញ ប្រសិនបើអ្នកចាប់ផ្តើម bot របស់យើង។',
        'អ៊ីមែលត្រូវផ្ញើតាមសេវាអ៊ីមែល ហើយការបង់ប្រាក់ដំណើរការដោយធនាគាររបស់អ្នកតាម KHQR / បាគង។',
        'យើងមិនលក់ទិន្នន័យរបស់អ្នកទេ។ អ្នកអាចស្នើលុបគណនីតាមផ្នែកជំនួយ លើកលែងតែកំណត់ត្រាដែលត្រូវរក្សាទុកសម្រាប់គណនេយ្យ។']],
    ]],
    zh: ['隐私政策', [
      ['p', '我们只收集运营平台所需的信息：姓名、邮箱、电话和 Telegram 用户名，您的订单和挂单，您上传的门票凭证和收据，您提供的收款信息和收款二维码，以及银行的付款记录。'],
      ['ul', ['门票凭证、收据和收款信息均为私密信息：只有您和 TicketNest 管理员可以查看。',
        '我们使用您的 Telegram 用户名交付门票；如您启动我们的机器人，也会发送订单通知。',
        '邮件通过我们的邮件服务商发送；付款由您的银行通过 KHQR / Bakong 处理。',
        '我们不会出售您的数据。您可以联系客服删除账户，但会计所需保留的记录除外。']],
    ]],
  },
}

function Doc({ title, children }) {
  const { t } = useT()
  return (
    <div className="page max-w-3xl pt-10">
      <h1 className="rise text-4xl font-bold">{title}</h1>
      <p className="mt-2 text-sm text-muted">{t('Last updated {date}', { date: 'November 2026' })}</p>
      <div className="rise mt-8 space-y-5 leading-relaxed text-ink/85 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-2">{children}</div>
    </div>
  )
}

const Blocks = ({ blocks }) => blocks.map(([k, v], i) => k === 'h' ? <h2 key={i}>{v}</h2> : k === 'ul' ? <ul key={i}>{v.map((x) => <li key={x}>{x}</li>)}</ul> : <p key={i}>{v}</p>)

export function HowItWorks() {
  const { settings } = useApp()
  const { t } = useT()
  const f = settings?.fees || { seller_commission_bps: 1500, buyer_markup_bps: 1500 }
  return (
    <Doc title={t('How TicketNest works')}>
      <p>{t('TicketNest is a small, independent marketplace where fans resell K-pop concert tickets to other fans. We review every listing, take the payment, and deliver the ticket to the buyer through Telegram.')}</p>
      <HowItWorksStrip markup={f.buyer_markup_bps} />
      <h2>{t('Fees')}</h2>
      <ul>
        <li>{t('Buyers pay the seller\'s price plus a {pct} marketplace fee. The full price is shown before you pay.', { pct: pct(f.buyer_markup_bps) })}</li>
        <li>{t('Sellers receive their listing price minus a {pct} commission. Example: a $100 listing pays the seller $85 and costs the buyer $115.', { pct: pct(f.seller_commission_bps) })}</li>
      </ul>
      <h2>{t('Payment')}</h2>
      <p>{t("You pay with KHQR — scan the code with ABA or any Bakong-member banking app. Your order is confirmed only when the bank payment is matched to your order. We never confirm an order from a screenshot. If a payment can't be matched automatically, our team checks it by hand.")}</p>
      <h2>{t('Delivery')}</h2>
      <p>{t('Tickets are delivered manually. After your payment is verified, a member of our team contacts you on Telegram and sends your ticket. Your order page shows when it has been delivered.')}</p>
      <h2>{t('Getting paid as a seller')}</h2>
      <p>{t('You are paid after the concert, not when a buyer buys your ticket. Your earnings (listing price minus commission) reach your wallet 24 to 48 hours after the concert ends, once the buyer has the ticket and has not reported a problem. You can then request a withdrawal.')}</p>
    </Doc>
  )
}

export function Policy() {
  const { slug } = useParams()
  const { lang } = useT()
  const doc = DOCS[slug]
  if (!doc) return <div className="page pt-10"><Empty title="Page not found" /></div>
  const [title, blocks] = doc[lang] || doc.en
  return <Doc title={title}><Blocks blocks={blocks} /></Doc>
}

export function Support() {
  const { settings } = useApp()
  const { t } = useT()
  const link = useLink()
  const u = settings?.telegram?.support_username
  return (
    <div className="page max-w-xl pt-10">
      <h1 className="rise text-3xl font-bold">{t('Support')}</h1>
      <p className="mt-3 text-muted">{t('The fastest way to reach us is Telegram. Include your order or listing number so we can help quickly.')}</p>
      {u ? <button onClick={() => openExternal(`https://t.me/${u}`)} className="btn-accent mt-6 py-3"><MessageCircle className="h-4 w-4" />{t('Message @{user}', { user: u })}</button>
        : <p className="mt-6 text-sm text-muted">{t('Use the chat button for help.')}</p>}
      <Reveal className="mt-10 space-y-2 text-sm">
        <Link className="block text-accent hover:underline" to={link('/policies/refunds')}>{t('Refund policy')}</Link>
        <Link className="block text-accent hover:underline" to={link('/policies/authenticity')}>{t('Ticket authenticity')}</Link>
      </Reveal>
    </div>
  )
}

export function NotFound() {
  const { t } = useT()
  return <div className="page pt-16"><Empty title={t('Page not found')} action={<Link to="/" className="btn-primary">{t('Go home')}</Link>}>{t("The page you're looking for doesn't exist.")}</Empty></div>
}
