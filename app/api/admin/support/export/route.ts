import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { listTicketsForAdmin, supportStats } from '@/lib/support/store'
import { categoryLabels, priorityLabels, ticketStatusLabels } from '@/lib/support/labels'

/**
 * Weekly support-quality export (feature 24).
 *
 * CSV rather than PDF: the operator wants to sort and pivot this in a spreadsheet,
 * and a CSV opens in Excel and Google Sheets alike. The leading BOM is what makes
 * Excel render the Arabic columns correctly instead of mojibake.
 */

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

export async function GET() {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  }

  const [tickets, stats] = await Promise.all([listTicketsForAdmin({}), supportStats()])

  const header = [
    'رقم التذكرة',
    'الموضوع',
    'الفئة',
    'الأولوية',
    'الحالة',
    'تاريخ الإنشاء',
    'أول رد (دقيقة)',
    'تجاوز الاتفاقية',
    'التقييم',
    'مسندة',
  ]

  const rows = tickets.map((ticket) => {
    const firstResponseMinutes = ticket.firstResponseAt
      ? Math.round((ticket.firstResponseAt - ticket.createdAt) / 60_000)
      : ''
    const breached =
      ticket.firstResponseAt === null &&
      ticket.slaDueAt !== null &&
      ticket.slaDueAt < Date.now() &&
      !['resolved', 'closed'].includes(ticket.status)
    return [
      ticket.ticketNumber,
      ticket.subject,
      categoryLabels[ticket.category],
      priorityLabels[ticket.priority],
      ticketStatusLabels[ticket.status],
      new Date(ticket.createdAt).toISOString(),
      firstResponseMinutes,
      breached ? 'نعم' : 'لا',
      ticket.satisfactionRating ?? '',
      ticket.assignedTo ?? 'غير مسندة',
    ].map(csvCell).join(',')
  })

  const summary = [
    '',
    ['ملخص', 'قيمة'].map(csvCell).join(','),
    [csvCell('إجمالي التذاكر'), csvCell(tickets.length)].join(','),
    [csvCell('مفتوحة'), csvCell(stats.open)].join(','),
    [csvCell('قيد المعالجة'), csvCell(stats.inProgress)].join(','),
    [csvCell('تجاوزت الاتفاقية'), csvCell(stats.slaBreached)].join(','),
    [csvCell('متوسط أول رد (دقيقة)'), csvCell(stats.avgFirstResponseMinutes ?? '—')].join(','),
    [csvCell('متوسط الرضا'), csvCell(stats.avgSatisfaction ?? '—')].join(','),
  ].join('\n')

  const body = `\uFEFF${header.map(csvCell).join(',')}\n${rows.join('\n')}\n${summary}\n`
  const date = new Date().toISOString().slice(0, 10)

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="fahes-support-${date}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
