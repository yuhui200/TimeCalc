/**
 * iCalendar (.ics) 生成。
 *
 * 遵循 RFC 5545：
 *   - 行分隔符固定为 CRLF
 *   - 单行超过 75 个八位组时折行（续行以单个空格开头）
 *   - 文本值转义 `\` `;` `,` 与换行
 *   - 时间统一用 UTC（以 Z 结尾），避免各端时区解释不一致
 */
import dayjs from './dayjs';
import { shortId } from './format';
import type { CalendarEvent } from './types';

const CRLF = '\r\n';
const PRODID = '-//TimeCalc//TimeCalc//ZH';

/** RFC 5545 文本转义 */
export function escapeICSText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * 折行：按 UTF-8 字节数不超过 75 切分。
 * 中文一个字符占 3 字节，所以不能按字符数切。
 */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const out: string[] = [];
  let current = '';
  let currentBytes = 0;
  // 首行 75 字节，续行 74 字节（开头要放一个空格）
  let limit = 75;

  for (const char of line) {
    const charBytes = encoder.encode(char).length;
    if (currentBytes + charBytes > limit) {
      out.push(current);
      current = char;
      currentBytes = charBytes;
      limit = 74;
    } else {
      current += char;
      currentBytes += charBytes;
    }
  }
  if (current) out.push(current);

  return out.join(`${CRLF} `);
}

/** 'YYYYMMDDTHHmmssZ' */
export function toICSDateTimeUtc(date: Date): string {
  return dayjs(date).utc().format('YYYYMMDD[T]HHmmss[Z]');
}

/** 'YYYYMMDD' */
export function toICSDate(date: Date): string {
  return dayjs(date).format('YYYYMMDD');
}

function fold(lines: string[]): string {
  return lines.map(foldLine).join(CRLF);
}

/**
 * 单个事件 -> VEVENT 行数组。
 * `now` 用于 DTSTAMP，注入它是为了让测试可复现。
 */
export function eventToVEvent(event: CalendarEvent, now: Date = new Date()): string[] {
  const uid = event.uid ?? `${shortId('tc-')}@timecalc.app`;
  const start = event.start;
  const end = event.end ?? dayjs(start).add(1, 'hour').toDate();

  const lines: string[] = ['BEGIN:VEVENT'];
  lines.push(`UID:${uid}`);
  lines.push(`DTSTAMP:${toICSDateTimeUtc(now)}`);

  if (event.allDay) {
    // 全天事件的 DTEND 是「不含」的，按 RFC 应指向次日
    const endExclusive = dayjs(start).add(1, 'day').toDate();
    lines.push(`DTSTART;VALUE=DATE:${toICSDate(start)}`);
    lines.push(`DTEND;VALUE=DATE:${toICSDate(endExclusive)}`);
  } else {
    lines.push(`DTSTART:${toICSDateTimeUtc(start)}`);
    lines.push(`DTEND:${toICSDateTimeUtc(end)}`);
  }

  lines.push(`SUMMARY:${escapeICSText(event.title || 'TimeCalc 事件')}`);

  if (event.description) {
    lines.push(`DESCRIPTION:${escapeICSText(event.description)}`);
  }
  if (event.location) {
    lines.push(`LOCATION:${escapeICSText(event.location)}`);
  }
  if (event.url) {
    lines.push(`URL:${escapeICSText(event.url)}`);
  }

  lines.push('STATUS:CONFIRMED');
  lines.push('TRANSP:OPAQUE');

  const reminder = event.reminderMinutes ?? 10;
  if (reminder > 0) {
    lines.push('BEGIN:VALARM');
    lines.push('ACTION:DISPLAY');
    lines.push(`DESCRIPTION:${escapeICSText(event.title || 'TimeCalc 提醒')}`);
    lines.push(`TRIGGER:-PT${Math.round(reminder)}M`);
    lines.push('END:VALARM');
  }

  lines.push('END:VEVENT');
  return lines;
}

export interface ICSOptions {
  /** 日历名称，会写入 X-WR-CALNAME */
  calendarName?: string;
  /** DTSTAMP 使用的时间，测试时注入固定值 */
  now?: Date;
  /** 提醒默认值（分钟），可被单个事件覆盖 */
  defaultReminderMinutes?: number;
  method?: 'PUBLISH' | 'REQUEST';
}

/** 生成完整的 .ics 文本 */
export function buildICS(events: readonly CalendarEvent[], options: ICSOptions = {}): string {
  const { calendarName = 'TimeCalc', now = new Date(), defaultReminderMinutes, method = 'PUBLISH' } = options;

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    `METHOD:${method}`,
    `X-WR-CALNAME:${escapeICSText(calendarName)}`,
  ];

  for (const event of events) {
    lines.push(
      ...eventToVEvent(
        defaultReminderMinutes !== undefined && event.reminderMinutes === undefined
          ? { ...event, reminderMinutes: defaultReminderMinutes }
          : event,
        now,
      ),
    );
  }

  lines.push('END:VCALENDAR');
  return `${fold(lines)}${CRLF}`;
}

/** 由日期差结果生成「纪念日」事件 */
export function eventFromCountdown(
  title: string,
  target: Date,
  description?: string,
  reminderMinutes = 10,
): CalendarEvent {
  return {
    title,
    description,
    start: target,
    end: dayjs(target).add(30, 'minute').toDate(),
    reminderMinutes,
  };
}

/** 建议的文件名：TimeCalc-20260914-153000.ics */
export function suggestICSFilename(at: Date = new Date()): string {
  return `TimeCalc-${dayjs(at).format('YYYYMMDD-HHmmss')}.ics`;
}

/** 宽松校验：能不能被日历软件导入（结构完整即可） */
export function isValidICS(text: string): boolean {
  return (
    text.startsWith('BEGIN:VCALENDAR') &&
    text.trimEnd().endsWith('END:VCALENDAR') &&
    text.includes('BEGIN:VEVENT') === text.includes('END:VEVENT')
  );
}

/** 解析 .ics 的 VEVENT 摘要（用于导入回显；不追求覆盖全部 RFC 分支） */
export function parseICSSummary(text: string): { summary: string; dtstart: string | null }[] {
  const blocks = text.split('BEGIN:VEVENT').slice(1);
  return blocks.map((block) => {
    const body = block.split('END:VEVENT')[0] ?? '';
    const unfold = body.replace(/\r\n[ \t]/g, '');
    const summary = unfold.match(/^SUMMARY:(.*)$/m)?.[1] ?? '(无标题)';
    const dtstart = unfold.match(/^DTSTART[^:]*:(.*)$/m)?.[1] ?? null;
    return {
      summary: summary.replace(/\\n/g, ' ').replace(/\\([;,])/g, '$1').replace(/\\\\/g, '\\'),
      dtstart: dtstart?.trim() ?? null,
    };
  });
}
