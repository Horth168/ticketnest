// Admin dashboard language: English or Khmer only (the customer website also has Chinese).
// The admin pages are written in English; in Khmer mode a small translator swaps the visible text,
// placeholders, tooltips and confirm() questions using this dictionary. Anything not listed simply
// stays in English, so a new screen never breaks or goes blank. Names, numbers and customer content
// (concert titles, messages) are never changed unless they exactly match a UI phrase.
import { useEffect, useState } from 'react'

export const KM = {
  // navigation & layout
  'Overview': 'ទិដ្ឋភាពទូទៅ', 'Sales': 'ការលក់', 'Orders': 'ការបញ្ជាទិញ', 'Payments': 'ការទូទាត់', 'Withdrawals': 'ការដកប្រាក់',
  'Catalogue': 'កាតាឡុក', 'Listings': 'ការដាក់លក់', 'Concerts': 'ការប្រគុំតន្ត្រី', 'Artists': 'សិល្បករ',
  'People & reports': 'មនុស្ស និងរបាយការណ៍', 'Users': 'អ្នកប្រើប្រាស់', 'Reviews': 'មតិអតិថិជន', 'Reports': 'របាយការណ៍',
  'System': 'ប្រព័ន្ធ', 'Settings': 'ការកំណត់', 'Backups': 'ការបម្រុងទុក', 'Audit log': 'កំណត់ហេតុសកម្មភាព',
  'Admin': 'អ្នកគ្រប់គ្រង', 'ADMIN': 'អ្នកគ្រប់គ្រង', 'Staff': 'បុគ្គលិក', 'Customer': 'អតិថិជន', 'Customers': 'អតិថិជន', 'Team': 'ក្រុមការងារ',
  'Back to TicketNest': 'ត្រឡប់ទៅ TicketNest', 'View website': 'មើលគេហទំព័រ', 'Sign out': 'ចាកចេញ', 'Menu': 'ម៉ឺនុយ', 'Close': 'បិទ',
  'Admin access required': 'ត្រូវការសិទ្ធិអ្នកគ្រប់គ្រង', 'Not found': 'រកមិនឃើញ', 'Nothing here': 'មិនមានអ្វីនៅទីនេះទេ',
  'Loading…': 'កំពុងផ្ទុក…', 'You': 'អ្នក', 'admin': 'អ្នកគ្រប់គ្រង', 'staff': 'បុគ្គលិក', 'customer': 'អតិថិជន',

  // overview
  "Here's how TicketNest is doing.": 'នេះជាស្ថានភាពរបស់ TicketNest។', 'Today': 'ថ្ងៃនេះ', 'Tickets sold': 'សំបុត្រដែលបានលក់',
  'Total sales': 'ការលក់សរុប', 'Platform revenue': 'ចំណូលវេទិកា', 'TicketNest revenue': 'ចំណូល TicketNest', 'TicketNest gross': 'ចំណូលសរុប TicketNest',
  'To deliver': 'ត្រូវប្រគល់', 'Needs attention': 'ត្រូវការការយកចិត្តទុកដាក់', 'Recent orders': 'ការបញ្ជាទិញថ្មីៗ', 'Best sellers': 'លក់ដាច់ជាងគេ',
  'Listings by status': 'ការដាក់លក់តាមស្ថានភាព', 'Revenue': 'ចំណូល', 'Tickets': 'សំបុត្រ', 'No sales yet.': 'មិនទាន់មានការលក់ទេ។',
  'Send report to Telegram': 'ផ្ញើរបាយការណ៍ទៅ Telegram', 'Report sent to Telegram': 'បានផ្ញើរបាយការណ៍ទៅ Telegram',
  'Paid orders': 'ការបញ្ជាទិញដែលបានបង់', 'per day': 'ក្នុងមួយថ្ងៃ', 'Avg / day': 'មធ្យម / ថ្ងៃ',

  // statuses (badges)
  'Awaiting payment': 'រង់ចាំការបង់ប្រាក់', 'Paid': 'បានបង់', 'Preparing ticket': 'កំពុងរៀបចំសំបុត្រ', 'Awaiting delivery': 'រង់ចាំការប្រគល់',
  'Delivered': 'បានប្រគល់', 'Completed': 'បានបញ្ចប់', 'Cancelled': 'បានបោះបង់', 'Refunded': 'បានសងប្រាក់វិញ',
  'Pending approval': 'រង់ចាំការអនុម័ត', 'Pending': 'កំពុងរង់ចាំ', 'Approved': 'បានអនុម័ត', 'Rejected': 'បានបដិសេធ', 'Available': 'មានលក់',
  'Reserved': 'កំពុងកក់', 'Sold': 'បានលក់', 'Disabled': 'បានបិទ', 'Hidden': 'លាក់', 'Visible': 'បង្ហាញ', 'Matched': 'ផ្គូផ្គងរួច',
  'pending': 'កំពុងរង់ចាំ', 'approved': 'បានអនុម័ត', 'rejected': 'បានបដិសេធ', 'scheduled': 'តាមកាលវិភាគ', 'postponed': 'ពន្យារពេល',
  'cancelled': 'បានបោះបង់', 'completed': 'បានបញ្ចប់', 'configured': 'បានកំណត់', 'not set': 'មិនទាន់កំណត់',
  'Published': 'បានផ្សាយ', 'Unpublished': 'មិនទាន់ផ្សាយ', 'Featured': 'ពិសេស', 'Popular': 'ពេញនិយម', 'Demo': 'សាកល្បង', 'Sample': 'គំរូ',

  // listings
  'Approve seller tickets before they go public, or add TicketNest\'s own tickets.': 'អនុម័តសំបុត្ររបស់អ្នកលក់ មុនពេលបង្ហាញជាសាធារណៈ ឬបន្ថែមសំបុត្ររបស់ TicketNest ផ្ទាល់។',
  'Add TicketNest tickets': 'បន្ថែមសំបុត្រ TicketNest', 'Add tickets': 'បន្ថែមសំបុត្រ', 'Add tickets manually': 'បន្ថែមសំបុត្រដោយដៃ',
  'Approve': 'អនុម័ត', 'Approve & publish': 'អនុម័ត និងផ្សាយ', 'Reject': 'បដិសេធ', 'Reject listing': 'បដិសេធការដាក់លក់',
  'Disable': 'បិទ', 'Disable (hide)': 'បិទ (លាក់)', 'Enable': 'បើក', 'Re-enable': 'បើកម្តងទៀត', 'Edit listing': 'កែការដាក់លក់',
  'Edit price / quantity': 'កែតម្លៃ / ចំនួន', 'Mark tickets sold (offline)': 'កត់ថាសំបុត្របានលក់ (ក្រៅប្រព័ន្ធ)',
  'Filter by concert': 'ច្រោះតាមការប្រគុំតន្ត្រី', 'No listings with this status.': 'មិនមានការដាក់លក់ក្នុងស្ថានភាពនេះទេ។', 'No listings yet.': 'មិនទាន់មានការដាក់លក់ទេ។',
  'Ticket proof': 'ភស្តុតាងសំបុត្រ', 'Purchase receipt': 'បង្កាន់ដៃទិញ', 'Payout QR': 'QR ទទួលប្រាក់', 'Seller payout QR': 'QR ទទួលប្រាក់របស់អ្នកលក់',
  "Seller's payout QR — scan with your bank app": 'QR ទទួលប្រាក់របស់អ្នកលក់ — ស្កេនដោយកម្មវិធីធនាគាររបស់អ្នក',
  'No payout QR uploaded.': 'មិនទាន់បានបង្ហោះ QR ទទួលប្រាក់ទេ។',
  "Private — only admins and the seller can open these. Compare the receipt's price with the original price below.": 'ឯកជន — មានតែអ្នកគ្រប់គ្រង និងអ្នកលក់ទេដែលអាចបើកបាន។ ប្រៀបធៀបតម្លៃលើបង្កាន់ដៃជាមួយតម្លៃដើមខាងក្រោម។',
  'Reason (shown to the seller)': 'មូលហេតុ (បង្ហាញដល់អ្នកលក់)', 'Seller': 'អ្នកលក់', 'Buyer': 'អ្នកទិញ', 'Category': 'ប្រភេទ', 'Concert': 'ការប្រគុំតន្ត្រី',
  'Seller price': 'តម្លៃអ្នកលក់', 'Seller price (USD)': 'តម្លៃអ្នកលក់ (USD)', 'Seller listing price': 'តម្លៃដាក់លក់របស់អ្នកលក់', 'Buyer pays': 'អ្នកទិញបង់',
  'Seller receives': 'អ្នកលក់ទទួលបាន', 'Original (face) price': 'តម្លៃដើម', 'Original price (USD)': 'តម្លៃដើម (USD)', 'Price (USD)': 'តម្លៃ (USD)',
  'Face value': 'តម្លៃដើម', 'TicketNest stock': 'សំបុត្រ TicketNest', "TicketNest's own stock (no seller payout).": 'សំបុត្ររបស់ TicketNest ផ្ទាល់ (គ្មានការទូទាត់ឱ្យអ្នកលក់)។',
  'Goes on sale immediately. The buyer markup applies; no seller commission.': 'ដាក់លក់ភ្លាមៗ។ គិតថ្លៃបន្ថែមលើអ្នកទិញ គ្មានកម្រៃជើងសារពីអ្នកលក់។',
  'Mobile transfer': 'ផ្ទេរតាមទូរស័ព្ទ', 'Paper ticket': 'សំបុត្រក្រដាស', 'Other': 'ផ្សេងៗ', 'Ticketing app transfer': 'ផ្ទេរតាមកម្មវិធីលក់សំបុត្រ',
  'E-ticket (PDF / QR)': 'សំបុត្រអេឡិចត្រូនិក (PDF / QR)', '← Listings': '← ការដាក់លក់', 'Details': 'ព័ត៌មានលម្អិត', 'History': 'ប្រវត្តិ',
  'Payout': 'ការទូទាត់ឱ្យអ្នកលក់', 'Example: $100 listing': 'ឧទាហរណ៍៖ ការដាក់លក់ $100', 'Put the tickets back on sale': 'ដាក់សំបុត្រលក់ឡើងវិញ',

  // orders
  'All orders': 'ការបញ្ជាទិញទាំងអស់', 'All': 'ទាំងអស់', 'Order': 'ការបញ្ជាទិញ', '← Orders': '← ការបញ្ជាទិញ', 'No orders': 'គ្មានការបញ្ជាទិញ',
  'No orders yet.': 'មិនទាន់មានការបញ្ជាទិញទេ។', 'Order number, name, Telegram, email': 'លេខបញ្ជាទិញ ឈ្មោះ Telegram អ៊ីមែល',
  'Message buyer': 'ផ្ញើសារទៅអ្នកទិញ', 'Deliver the ticket': 'ប្រគល់សំបុត្រ', '1. Message the buyer on Telegram:': '1. ផ្ញើសារទៅអ្នកទិញតាម Telegram៖',
  "3. Record the delivery here — this releases the seller's earnings.": '3. កត់ត្រាការប្រគល់នៅទីនេះ — វានឹងបញ្ចេញប្រាក់ចំណូលរបស់អ្នកលក់។',
  'Record delivery': 'កត់ត្រាការប្រគល់', 'Delivery': 'ការប្រគល់', 'Delivery method': 'វិធីប្រគល់', 'In person': 'ផ្ទាល់ខ្លួន', 'Telegram': 'Telegram',
  'Attach confirmation or ticket file (optional)': 'ភ្ជាប់ការបញ្ជាក់ ឬឯកសារសំបុត្រ (ស្រេចចិត្ត)', 'The buyer can download it from their order': 'អ្នកទិញអាចទាញយកវាពីការបញ្ជាទិញរបស់ពួកគេ',
  'Open attached file': 'បើកឯកសារភ្ជាប់', 'Mark paid': 'កត់ថាបានបង់', 'Mark preparing': 'កត់ថាកំពុងរៀបចំ', 'Mark awaiting delivery': 'កត់ថារង់ចាំការប្រគល់',
  'Mark delivered': 'កត់ថាបានប្រគល់', 'Mark completed': 'កត់ថាបានបញ្ចប់', 'Cancel order': 'បោះបង់ការបញ្ជាទិញ', 'Reason (shown to the buyer)': 'មូលហេតុ (បង្ហាញដល់អ្នកទិញ)',
  'Record a refund': 'កត់ត្រាការសងប្រាក់', 'Record refund': 'កត់ត្រាការសងប្រាក់',
  "Send the money back from your bank app first. This records the refund, reverses the seller's earnings and emails the buyer.": 'ផ្ញើប្រាក់ត្រឡប់ពីកម្មវិធីធនាគាររបស់អ្នកជាមុនសិន។ វានឹងកត់ត្រាការសងប្រាក់ ដកប្រាក់ចំណូលរបស់អ្នកលក់វិញ និងផ្ញើអ៊ីមែលទៅអ្នកទិញ។',
  'Internal note': 'កំណត់ចំណាំផ្ទៃក្នុង', 'Save note': 'រក្សាទុកកំណត់ចំណាំ', 'Note (optional)': 'កំណត់ចំណាំ (ស្រេចចិត្ត)', 'Email invoice again': 'ផ្ញើវិក្កយបត្រតាមអ៊ីមែលម្តងទៀត',
  'View PDF': 'មើល PDF', 'PDF · open': 'PDF · បើក', 'Buyer paid': 'អ្នកទិញបានបង់', 'Seller payout': 'ការទូទាត់ឱ្យអ្នកលក់', 'Total': 'សរុប', 'Ref': 'លេខយោង',
  'Confirm payment manually': 'បញ្ជាក់ការបង់ប្រាក់ដោយដៃ', 'Confirm payment manually (ABA Trx ID)': 'បញ្ជាក់ការបង់ប្រាក់ដោយដៃ (ABA Trx ID)',
  'ABA transaction ID (from the PayWay message or bank app)': 'លេខប្រតិបត្តិការ ABA (ពីសារ PayWay ឬកម្មវិធីធនាគារ)', 'Bank transfer reference': 'លេខយោងការផ្ទេរប្រាក់',
  'Only use this after you have checked the money arrived. Each transaction ID can be used once.': 'ប្រើវាតែបន្ទាប់ពីអ្នកបានពិនិត្យថាប្រាក់បានចូលហើយ។ លេខប្រតិបត្តិការនីមួយៗប្រើបានតែម្តង។',
  'Confirm paid': 'បញ្ជាក់ថាបានបង់', 'Confirm': 'បញ្ជាក់', 'Payment records': 'កំណត់ត្រាការបង់ប្រាក់', 'Contact email': 'អ៊ីមែលទំនាក់ទំនង', 'No email': 'គ្មានអ៊ីមែល',

  // payments & withdrawals
  'Every ABA PayWay notification the listener saw, and what happened to it.': 'រាល់សារជូនដំណឹង ABA PayWay ដែលប្រព័ន្ធបានឃើញ និងលទ្ធផលរបស់វា។',
  'Orders are confirmed automatically only when a genuine PayWay message matches exactly one pending order. Everything else waits here for you.': 'ការបញ្ជាទិញត្រូវបានបញ្ជាក់ដោយស្វ័យប្រវត្តិ តែពេលសារ PayWay ពិតត្រូវនឹងការបញ្ជាទិញដែលរង់ចាំតែមួយប៉ុណ្ណោះ។ ករណីផ្សេងទៀតរង់ចាំអ្នកនៅទីនេះ។',
  'No PayWay notifications yet.': 'មិនទាន់មានសារ PayWay ទេ។', 'Assign to order': 'ភ្ជាប់ទៅការបញ្ជាទិញ', 'No open order has this amount.': 'គ្មានការបញ្ជាទិញបើកណាដែលមានចំនួននេះទេ។',
  'Orders with an open QR for exactly this amount. Check the payer name against the buyer before confirming.': 'ការបញ្ជាទិញដែលមាន QR បើកសម្រាប់ចំនួនពិតប្រាកដនេះ។ ពិនិត្យឈ្មោះអ្នកបង់ជាមួយអ្នកទិញមុនបញ្ជាក់។',
  'Payment assigned, order is paid': 'បានភ្ជាប់ការបង់ប្រាក់ ការបញ្ជាទិញបានបង់រួច', 'Listener:': 'ប្រព័ន្ធស្តាប់៖',
  'Pay sellers from your bank app, then mark the request paid.': 'ទូទាត់ឱ្យអ្នកលក់ពីកម្មវិធីធនាគាររបស់អ្នក រួចកត់ថាសំណើបានបង់។',
  'No withdrawals': 'គ្មានការដកប្រាក់', 'Reject withdrawal': 'បដិសេធការដកប្រាក់', 'Reject and return to wallet': 'បដិសេធ និងបង្វិលទៅកាបូប',

  // concerts & artists
  'Add concert': 'បន្ថែមការប្រគុំតន្ត្រី', 'Edit concert': 'កែការប្រគុំតន្ត្រី', 'Add real concerts with their official dates and venues.': 'បន្ថែមការប្រគុំតន្ត្រីពិត ជាមួយកាលបរិច្ឆេទ និងទីតាំងផ្លូវការ។',
  'No concerts yet': 'មិនទាន់មានការប្រគុំតន្ត្រីទេ', 'Add the first concert so sellers can list tickets for it.': 'បន្ថែមការប្រគុំតន្ត្រីដំបូង ដើម្បីឱ្យអ្នកលក់អាចដាក់លក់សំបុត្របាន។',
  'Artist': 'សិល្បករ', 'Choose…': 'ជ្រើសរើស…', 'Concert name': 'ឈ្មោះការប្រគុំតន្ត្រី', 'Venue': 'ទីតាំង', 'Date & time (local)': 'កាលបរិច្ឆេទ និងម៉ោង (ម៉ោងក្នុងស្រុក)',
  'City': 'ទីក្រុង', 'Country': 'ប្រទេស', 'Doors open': 'ម៉ោងបើកទ្វារ', 'Status': 'ស្ថានភាព', 'Seat map': 'ផែនទីកៅអី', 'No seat map': 'គ្មានផែនទីកៅអី',
  'Stadium (pens + 2 tiers)': 'កីឡដ្ឋាន (តំបន់ឈរ + ២ ជាន់)', 'Indoor arena (pens + 2 tiers, smaller)': 'សាលក្នុងផ្ទះ (តំបន់ឈរ + ២ ជាន់ តូចជាង)',
  'Poster': 'ផូស្ទ័រ', 'Upload image': 'បង្ហោះរូបភាព', 'Remove': 'ដកចេញ', 'Description': 'ការពិពណ៌នា',
  'Ticket delivery information (shown on the concert page)': 'ព័ត៌មានការប្រគល់សំបុត្រ (បង្ហាញលើទំព័រការប្រគុំតន្ត្រី)',
  'Leave empty for the standard Telegram delivery text': 'ទុកទទេ ដើម្បីប្រើអត្ថបទប្រគល់តាម Telegram ស្តង់ដារ', 'Ticket categories': 'ប្រភេទសំបុត្រ',
  'Name (VIP, CAT 1, Standing…)': 'ឈ្មោះ (VIP, CAT 1, ឈរ…)', 'Remove category': 'ដកប្រភេទចេញ', 'Pick this category\'s zones on the map': 'ជ្រើសតំបន់របស់ប្រភេទនេះលើផែនទី',
  'Zones for': 'តំបន់សម្រាប់', 'Tap zones to add or remove them': 'ចុចលើតំបន់ ដើម្បីបន្ថែម ឬដកចេញ', 'Featured on homepage': 'បង្ហាញពិសេសលើទំព័រដើម',
  "Demo concert: staff-only, can't be published or bought": 'ការប្រគុំតន្ត្រីសាកល្បង៖ សម្រាប់បុគ្គលិកតែប៉ុណ្ណោះ មិនអាចផ្សាយ ឬទិញបានទេ',
  'Save concert': 'រក្សាទុកការប្រគុំតន្ត្រី', 'Delete': 'លុប', 'Delete (or unpublish if it has listings)?': 'លុប (ឬបិទការផ្សាយ ប្រសិនបើមានការដាក់លក់)?',
  'Concert saved': 'បានរក្សាទុកការប្រគុំតន្ត្រី', 'Add artist': 'បន្ថែមសិល្បករ', 'Edit artist': 'កែសិល្បករ', 'Upload photo': 'បង្ហោះរូបថត', 'Replace photo': 'ប្តូររូបថត',
  'Use only photos you have the rights to.': 'ប្រើតែរូបថតដែលអ្នកមានសិទ្ធិប៉ុណ្ណោះ។', 'Name': 'ឈ្មោះ', 'Genre': 'ប្រភេទតន្ត្រី', 'Agency': 'ក្រុមហ៊ុន', 'Bio': 'ប្រវត្តិ',
  'K-pop': 'K-pop', 'Save': 'រក្សាទុក', 'Saved': 'បានរក្សាទុក', 'Upload': 'បង្ហោះ', 'Cancel': 'បោះបង់', 'Edit': 'កែ', 'Search': 'ស្វែងរក',

  // users
  'Search name, email, Telegram': 'ស្វែងរកឈ្មោះ អ៊ីមែល Telegram', 'No users found': 'រកមិនឃើញអ្នកប្រើប្រាស់', 'Email': 'អ៊ីមែល', 'Website': 'គេហទំព័រ',
  'Account deleted': 'គណនីត្រូវបានលុប', 'joined': 'បានចូលរួម', 'orders': 'ការបញ្ជាទិញ', 'listings': 'ការដាក់លក់',

  // reviews
  'Customers write reviews from the homepage. Only approved reviews appear in the slider.': 'អតិថិជនសរសេរមតិពីទំព័រដើម។ មានតែមតិដែលបានអនុម័តទេដែលបង្ហាញក្នុងស្លាយ។',
  'Samples are preview text written by TicketNest so you can see the slider before real reviews arrive. Only staff see them (on the homepage, while signed in), and they cannot be published as customer reviews. Delete them once real reviews come in.': 'មតិគំរូ ជាអត្ថបទមើលជាមុនដែល TicketNest សរសេរ ដើម្បីឱ្យអ្នកឃើញស្លាយ មុនពេលមានមតិពិត។ មានតែបុគ្គលិកទេដែលឃើញ (លើទំព័រដើម ពេលចូលគណនី) ហើយមិនអាចផ្សាយជាមតិអតិថិជនបានទេ។ លុបវាចោល ពេលមានមតិពិត។',
  'New reviews waiting for approval appear here.': 'មតិថ្មីដែលរង់ចាំការអនុម័តនឹងបង្ហាញនៅទីនេះ។', 'No reviews in this list.': 'គ្មានមតិក្នុងបញ្ជីនេះទេ។',
  'Sample content': 'មាតិកាគំរូ', 'Unpublish': 'បិទការផ្សាយ', 'Delete this review?': 'លុបមតិនេះ?', 'Review published': 'បានផ្សាយមតិ',
  'Review rejected': 'បានបដិសេធមតិ', 'Review deleted': 'បានលុបមតិ', 'Verified buyer': 'អ្នកទិញដែលបានផ្ទៀងផ្ទាត់', 'Verified seller': 'អ្នកលក់ដែលបានផ្ទៀងផ្ទាត់',

  // backups
  'Back up now': 'បម្រុងទុកឥឡូវ', 'Backing up…': 'កំពុងបម្រុងទុក…', 'No backups yet': 'មិនទាន់មានការបម្រុងទុកទេ', 'Download': 'ទាញយក',
  'The first one runs within a few minutes of the API starting, or press “Back up now”.': 'ការបម្រុងទុកដំបូងដំណើរការក្នុងរយៈពេលប៉ុន្មាននាទីបន្ទាប់ពី API ចាប់ផ្តើម ឬចុច “បម្រុងទុកឥឡូវ”។',
  'Backups contain customer data: keep downloaded files private. To restore one into a new empty database, run': 'ការបម្រុងទុកមានទិន្នន័យអតិថិជន៖ រក្សាឯកសារដែលទាញយកជាឯកជន។ ដើម្បីស្តារទៅមូលដ្ឋានទិន្នន័យទទេថ្មី សូមដំណើរការ',
  'and then': 'ហើយបន្ទាប់មក', 'in the backend folder.': 'ក្នុងថត backend។',

  // reports
  'Export orders (CSV)': 'នាំចេញការបញ្ជាទិញ (CSV)', 'Seller wallet transactions': 'ប្រតិបត្តិការកាបូបអ្នកលក់', 'No wallet activity yet': 'មិនទាន់មានសកម្មភាពកាបូបទេ',
  'The CSV includes every order with seller price, buyer markup, commission, seller payout, platform revenue, invoice and payment reference — ready for your accounting.': 'ឯកសារ CSV មានរាល់ការបញ្ជាទិញ ជាមួយតម្លៃអ្នកលក់ ថ្លៃបន្ថែមអ្នកទិញ កម្រៃជើងសារ ការទូទាត់ឱ្យអ្នកលក់ ចំណូលវេទិកា វិក្កយបត្រ និងលេខយោងការបង់ប្រាក់ — រួចរាល់សម្រាប់គណនេយ្យ។',

  // settings
  'Settings saved': 'បានរក្សាទុកការកំណត់', 'Fees': 'ថ្លៃសេវា', 'Buyer markup': 'ថ្លៃបន្ថែមលើអ្នកទិញ', 'Buyer markup (%)': 'ថ្លៃបន្ថែមលើអ្នកទិញ (%)',
  'Seller commission': 'កម្រៃជើងសារពីអ្នកលក់', 'Seller commission (%)': 'កម្រៃជើងសារពីអ្នកលក់ (%)', 'Buyer fee + seller commission': 'ថ្លៃអ្នកទិញ + កម្រៃជើងសារអ្នកលក់',
  'Changes apply to new checkouts. Existing orders keep the fees they were created with.': 'ការផ្លាស់ប្តូរអនុវត្តចំពោះការទិញថ្មី។ ការបញ្ជាទិញចាស់រក្សាថ្លៃដដែល។',
  'Save fees': 'រក្សាទុកថ្លៃសេវា', 'Currency': 'រូបិយប័ណ្ណ', 'USD → KHR rate': 'អត្រា USD → KHR', 'Used to show riel totals and for riel QRs': 'ប្រើសម្រាប់បង្ហាញចំនួនរៀល និង QR ជារៀល',
  'Show riel amounts': 'បង្ហាញចំនួនជារៀល', 'Save currency': 'រក្សាទុករូបិយប័ណ្ណ', 'Your ABA merchant KHQR code': 'កូដ KHQR អាជីវករ ABA របស់អ្នក',
  'Every order gets its own QR built from this code, with the exact amount and order number.': 'ការបញ្ជាទិញនីមួយៗទទួលបាន QR ផ្ទាល់ខ្លួនពីកូដនេះ ជាមួយចំនួនប្រាក់ និងលេខបញ្ជាទិញពិតប្រាកដ។',
  'Read from QR image': 'អានពីរូបភាព QR', 'No QR code found in that image': 'រកមិនឃើញកូដ QR ក្នុងរូបភាពនោះទេ',
  'Your browser cannot read QR images. Paste the KHQR text instead.': 'កម្មវិធីរុករករបស់អ្នកមិនអាចអានរូបភាព QR បានទេ។ សូមបិទភ្ជាប់អត្ថបទ KHQR ជំនួសវិញ។',
  'Check code': 'ពិនិត្យកូដ', 'Payments go to:': 'ប្រាក់នឹងចូលទៅ៖', 'QR currency': 'រូបិយប័ណ្ណ QR', 'KHQR checkout enabled': 'បើកការទូទាត់តាម KHQR',
  'Late payment grace (minutes)': 'រយៈពេលអនុគ្រោះការបង់យឺត (នាទី)', 'Save payment settings': 'រក្សាទុកការកំណត់ការទូទាត់',
  'Low-stock alert at (tickets left)': 'ជូនដំណឹងពេលសំបុត្រជិតអស់ (សំបុត្រនៅសល់)', 'Save stock alert': 'រក្សាទុកការជូនដំណឹងស្តុក',
  'Telegram bot': 'Telegram bot', 'Admin alerts': 'ការជូនដំណឹងអ្នកគ្រប់គ្រង', 'Customer order updates': 'ព័ត៌មានការបញ្ជាទិញសម្រាប់អតិថិជន',
  'Send a daily report to the admin group': 'ផ្ញើរបាយការណ៍ប្រចាំថ្ងៃទៅក្រុមអ្នកគ្រប់គ្រង', 'Report time (Phnom Penh)': 'ម៉ោងរបាយការណ៍ (ភ្នំពេញ)',
  'Delivery Telegram username': 'ឈ្មោះ Telegram សម្រាប់ប្រគល់សំបុត្រ', 'The account that sends tickets to buyers': 'គណនីដែលផ្ញើសំបុត្រទៅអ្នកទិញ',
  'Support Telegram username': 'ឈ្មោះ Telegram សម្រាប់ជំនួយ', 'Mini App link': 'តំណ Mini App', 'Send test alert': 'ផ្ញើការជូនដំណឹងសាកល្បង',
  'Test alert sent': 'បានផ្ញើការជូនដំណឹងសាកល្បង', 'Telegram refused the message': 'Telegram បានបដិសេធសារ', 'Website name': 'ឈ្មោះគេហទំព័រ',
  'Integrations': 'ការភ្ជាប់សេវា', 'Configured on the server (environment variables). Status only.': 'កំណត់នៅលើម៉ាស៊ីនមេ (environment variables)។ បង្ហាញតែស្ថានភាព។',
  'Secrets (bot tokens, API keys, passwords) are set as server environment variables and never shown here.': 'ព័ត៌មានសម្ងាត់ (bot token, API key, ពាក្យសម្ងាត់) កំណត់នៅលើម៉ាស៊ីនមេ ហើយមិនដែលបង្ហាញនៅទីនេះទេ។',
  'Telegram bot token': 'Telegram bot token', 'Admin alert group': 'ក្រុមជូនដំណឹងអ្នកគ្រប់គ្រង', 'Payment group': 'ក្រុមការទូទាត់', 'Bakong API': 'Bakong API',
  'Bakong ID': 'Bakong ID', 'Google sign-in': 'ចូលដោយ Google', 'Google client ID': 'Google client ID', 'Emails': 'អ៊ីមែល', 'All notifications': 'ការជូនដំណឹងទាំងអស់',

  // buyer protection
  'Buyer protection': 'ការការពារអ្នកទិញ', 'Buyer reported a problem': 'អ្នកទិញបានរាយការណ៍បញ្ហា', 'Dismiss report': 'បដិសេធរបាយការណ៍',
  'Problem report resolved': 'បានដោះស្រាយរបាយការណ៍បញ្ហា', 'Seller payout': 'ការទូទាត់ឱ្យអ្នកលក់', 'Release payout now': 'ទូទាត់ឱ្យអ្នកលក់ឥឡូវ',
  'Ticket not received': 'មិនបានទទួលសំបុត្រ', "Ticket didn't work / entry refused": 'សំបុត្រប្រើមិនបាន / មិនឱ្យចូល',
  'Wrong seat, category or quantity': 'កៅអី ប្រភេទ ឬចំនួនខុស', 'Other problem': 'បញ្ហាផ្សេងទៀត',
  "The seller's payout is frozen. Check with the buyer and seller, then either dismiss the report (the seller is paid on schedule) or record a refund (the seller's earnings are taken back).": 'ការទូទាត់ឱ្យអ្នកលក់ត្រូវបានបង្កក។ ពិនិត្យជាមួយអ្នកទិញ និងអ្នកលក់ រួចបដិសេធរបាយការណ៍ (អ្នកលក់ទទួលប្រាក់តាមកាលវិភាគ) ឬកត់ត្រាការសងប្រាក់ (ដកប្រាក់ចំណូលអ្នកលក់វិញ)។',
  'Pay sellers only after the concert': 'ទូទាត់ឱ្យអ្នកលក់តែបន្ទាប់ពីការប្រគុំតន្ត្រី', 'Release payout (hours after start)': 'ទូទាត់ (ម៉ោងបន្ទាប់ពីចាប់ផ្តើម)',
  'Buyers can report until (hours after start)': 'អ្នកទិញអាចរាយការណ៍រហូតដល់ (ម៉ោងបន្ទាប់ពីចាប់ផ្តើម)', 'Price cap (% of face value)': 'កំណត់តម្លៃខ្ពស់បំផុត (% នៃតម្លៃដើម)',
  'Save buyer protection': 'រក្សាទុកការការពារអ្នកទិញ', "Dismiss the buyer's report": 'បដិសេធរបាយការណ៍របស់អ្នកទិញ', 'What you found (shown to the buyer)': 'អ្វីដែលអ្នករកឃើញ (បង្ហាញដល់អ្នកទិញ)',
  // audit
  'Every important action, with who did it.': 'រាល់សកម្មភាពសំខាន់ៗ និងអ្នកដែលបានធ្វើ។', 'Filter, e.g. payment, listing, withdrawal': 'ច្រោះ ឧ. payment, listing, withdrawal',
}

// phrases with numbers or names inside
const PATTERNS = [
  [/^Pending (\d+)$/, (m) => `កំពុងរង់ចាំ ${m[1]}`], [/^Approved (\d+)$/, (m) => `បានអនុម័ត ${m[1]}`], [/^Rejected (\d+)$/, (m) => `បានបដិសេធ ${m[1]}`],
  [/^Samples (\d+)$/, (m) => `គំរូ ${m[1]}`], [/^Listing #(\d+)$/, (m) => `ការដាក់លក់ #${m[1]}`], [/^Category (\d+)$/, (m) => `ប្រភេទ ${m[1]}`],
  [/^Good (morning|afternoon|evening), (.+)$/, (m) => `${{ morning: 'អរុណសួស្តី', afternoon: 'ទិវាសួស្តី', evening: 'សាយ័ណ្ហសួស្តី' }[m[1]]} ${m[2]}`],
  [/^Backup saved \((.+)\)$/, (m) => `បានរក្សាទុកការបម្រុងទុក (${m[1]})`], [/^Pay (.+) · (\$.+)$/, (m) => `ទូទាត់ឱ្យ ${m[1]} · ${m[2]}`],
  [/^Mark (\$[\d.,]+) as paid$/, (m) => `កត់ថា ${m[1]} បានបង់`], [/^Now (.+)$/, (m) => `បច្ចុប្បន្ន ${m[1]}`],
  [/^Last backup: (.+)$/, (m) => `ការបម្រុងទុកចុងក្រោយ៖ ${m[1]}`], [/^(\d+) (pending|approved|rejected|available|sold|cancelled|disabled|reserved)$/, (m) => `${m[1]} ${KM[m[2]] || m[2]}`],
  [/^Disable (.+)\? They won't be able to sign in or use their account\.$/, (m) => `បិទ ${m[1]}? ពួកគេនឹងមិនអាចចូល ឬប្រើគណនីបានទេ។`],
  [/^Make (.+) an admin\? Admins can change settings, roles and payouts\.$/, (m) => `ធ្វើឱ្យ ${m[1]} ក្លាយជាអ្នកគ្រប់គ្រង? អ្នកគ្រប់គ្រងអាចប្តូរការកំណត់ តួនាទី និងការទូទាត់។`],
  [/^Every table is saved automatically each day after (\d+):00 \(Phnom Penh time\) to your private Cloudflare storage\. The last (\d+) are kept\.$/,
    (m) => `តារាងទាំងអស់ត្រូវបានរក្សាទុកដោយស្វ័យប្រវត្តិរៀងរាល់ថ្ងៃក្រោយម៉ោង ${m[1]}:00 (ម៉ោងភ្នំពេញ) ទៅកាន់ឃ្លាំង Cloudflare ឯកជនរបស់អ្នក។ រក្សាទុក ${m[2]} ចុងក្រោយ។`],
]

export function translate(text) {
  const t = text.trim()
  if (!t || !/[A-Za-z]/.test(t)) return null
  let out = KM[t]
  if (out === undefined) {
    for (const [re, fn] of PATTERNS) { const m = t.match(re); if (m) { out = fn(m); break } }
  }
  if (out === undefined) return null
  return text.replace(t, out)   // keep the surrounding spaces
}

const KEY = 'tn-admin-lang'
export function initialAdminLang() {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'en' || saved === 'km') return saved
    return localStorage.getItem('tn-lang') === 'km' ? 'km' : 'en'
  } catch { return 'en' }
}

const ATTRS = ['placeholder', 'title', 'aria-label']
// English originals, kept across language switches so going back to English is exact
const orig = new WeakMap(), last = new WeakMap(), attrOrig = new WeakMap()
const SKIP = 'SCRIPT,STYLE,TEXTAREA,INPUT,SELECT,CODE,PRE'.split(',')

// Runs while the admin is open. Remembers each node's English text so switching back is exact,
// and re-translates when React updates a node.
export function useAdminLanguage() {
  const [lang, setLangState] = useState(initialAdminLang)
  const setLang = (l) => { setLangState(l); try { localStorage.setItem(KEY, l) } catch { /* ignore */ } }

  useEffect(() => {
    const km = lang === 'km'
    document.documentElement.dataset.adminLang = lang

    const doText = (n) => {
      const p = n.parentElement
      if (!p || SKIP.includes(p.tagName) || p.closest('[data-no-translate]')) return
      const cur = n.nodeValue
      if (!last.has(n) || last.get(n) !== cur) orig.set(n, cur)    // React wrote new English text
      const en = orig.get(n)
      const out = km ? (translate(en) ?? en) : en
      if (out !== cur) n.nodeValue = out
      last.set(n, out)
    }
    const doAttrs = (el) => {
      if (el.closest?.('[data-no-translate]')) return
      let saved = attrOrig.get(el)
      for (const a of ATTRS) {
        if (!el.hasAttribute?.(a)) continue
        const cur = el.getAttribute(a)
        if (!saved) { saved = {}; attrOrig.set(el, saved) }
        if (saved[a] === undefined || (saved[`${a}:out`] !== cur)) saved[a] = cur
        const out = km ? (translate(saved[a]) ?? saved[a]) : saved[a]
        if (out !== cur) el.setAttribute(a, out)
        saved[`${a}:out`] = out
      }
    }
    const walk = (root) => {
      if (root.nodeType === 3) return doText(root)
      if (root.nodeType !== 1 || SKIP.includes(root.tagName)) return
      doAttrs(root)
      const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
      let n = it.nextNode()
      while (n) { if (n.nodeType === 3) doText(n); else doAttrs(n); n = it.nextNode() }
    }
    walk(document.body)
    const mo = new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === 'characterData') doText(m.target)
        else if (m.type === 'attributes') doAttrs(m.target)
        else m.addedNodes.forEach(walk)
      }
    })
    mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS })

    const nativeConfirm = window.confirm
    if (km) window.confirm = (msg) => nativeConfirm.call(window, translate(String(msg)) ?? msg)
    return () => {
      mo.disconnect()
      window.confirm = nativeConfirm
      delete document.documentElement.dataset.adminLang
    }
  }, [lang])
  return [lang, setLang]
}
