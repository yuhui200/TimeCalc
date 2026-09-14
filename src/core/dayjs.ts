/**
 * 全局唯一的 dayjs 实例。
 *
 * 所有 core 模块必须从这里 import dayjs，避免各文件重复 extend 造成
 * 插件重复注册或漏注册。`import 'dayjs/locale/zh-cn'` 让 format 输出
 * 中文星期 / 月份，relativeTime 输出中文相对时间。
 */
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import advancedFormat from 'dayjs/plugin/advancedFormat';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import isoWeek from 'dayjs/plugin/isoWeek';
import weekOfYear from 'dayjs/plugin/weekOfYear';
import relativeTime from 'dayjs/plugin/relativeTime';
import duration from 'dayjs/plugin/duration';
import 'dayjs/locale/zh-cn';

// timezone 插件依赖 utc 插件，注册顺序不可颠倒
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);
dayjs.extend(advancedFormat);
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);
dayjs.extend(isoWeek);
dayjs.extend(weekOfYear);
dayjs.extend(relativeTime);
dayjs.extend(duration);

// 默认中文；调用方可用 dayjs.locale('en') 临时切换
dayjs.locale('zh-cn');

export default dayjs;
export { dayjs };
export type { Dayjs } from 'dayjs';
