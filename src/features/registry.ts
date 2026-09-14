/**
 * 功能面板注册表。
 *
 * **这是导航、命令面板、快捷键、历史记录四处的唯一事实来源。**
 * 之前这四处各自维护一份列表，加一个面板要改四个地方，必然漏。
 *
 * 约定：
 *   - `id` 与 `HistoryKind` 对齐（历史记录写的是哪个面板的 kind，
 *     就能直接跳回哪个面板），额外的 `history` / `settings` / `about`
 *     不属于计算功能，因此单独扩展在 `PanelId` 里。
 *   - `hotkey` 只写加速键字符串，实际注册与展示都由 hooks 处理，
 *     面板自己不关心键位。
 *   - `keywords` 供命令面板做模糊匹配：中文没有词边界，
 *     靠拼音首字母 + 别名比通用模糊匹配更准。
 */
import type { ComponentType } from 'react';
import type { HistoryKind } from '../db/types';
import { NaturalPanel } from './natural/NaturalPanel';
import { DateDiffPanel } from './dateDiff/DateDiffPanel';
import { DateAddPanel } from './dateAdd/DateAddPanel';
import { TimeDiffPanel } from './timeDiff/TimeDiffPanel';
import { TimeAddPanel } from './timeAdd/TimeAddPanel';
import { TimezonePanel } from './timezone/TimezonePanel';
import { UnixPanel } from './unix/UnixPanel';
import { CountdownPanel } from './countdown/CountdownPanel';
import { HistoryPanel } from './history/HistoryPanel';
import { SettingsPanel } from './settings/SettingsPanel';
import { AboutPanel } from './about/AboutPanel';

export type PanelId = HistoryKind | 'history' | 'settings' | 'about';

export interface PanelDefinition {
  id: PanelId;
  /** 导航与标题里显示的完整名称 */
  label: string;
  /** 手机上底栏用的短名（≤4 字） */
  short: string;
  /** 纯 emoji，不引入图标库 */
  icon: string;
  /** 一句话说明这个面板能做什么 */
  description: string;
  component: ComponentType;
  /** 加速键，如 'mod+1'；不写表示没有快捷键 */
  hotkey?: string;
  /** 命令面板的额外匹配词（别名 / 拼音首字母 / 英文） */
  keywords: string[];
  /** 是否出现在主导航里（关于页这类不出现在主列表） */
  inNav: boolean;
}

export const PANELS: readonly PanelDefinition[] = [
  {
    id: 'natural',
    label: '自然语言',
    short: '一句话',
    icon: '💬',
    description: '用一句话描述你想算什么，自动判断该用哪个功能',
    component: NaturalPanel,
    hotkey: 'mod+1',
    keywords: ['自然语言', 'zryy', '一句话', 'natural', 'nlp', 'ai', '解析'],
    inNav: true,
  },
  {
    id: 'date-diff',
    label: '日期差',
    short: '日期差',
    icon: '📅',
    description: '两个日期相差多少天、周、月，含工作日与节假日',
    component: DateDiffPanel,
    hotkey: 'mod+2',
    keywords: ['日期差', 'rqc', '相差', '间隔', 'days', 'diff', '工作日', 'date'],
    inNav: true,
  },
  {
    id: 'date-add',
    label: '日期加减',
    short: '日期加',
    icon: '➕',
    description: '在某个日期上加减天数、周数、月数、年数',
    component: DateAddPanel,
    hotkey: 'mod+3',
    keywords: ['日期加减', 'rqjj', '推算', '几天后', 'add', 'shift', '农历'],
    inNav: true,
  },
  {
    id: 'time-diff',
    label: '时间差',
    short: '时间差',
    icon: '⏱',
    description: '两个时刻相差多少小时多少分钟，可扣除休息时间',
    component: TimeDiffPanel,
    hotkey: 'mod+4',
    keywords: ['时间差', 'sjc', '工时', '时长', 'hours', 'shift', '班次'],
    inNav: true,
  },
  {
    id: 'time-add',
    label: '时间加减',
    short: '时间加',
    icon: '🕐',
    description: '某个时刻加上一段时长，自动处理跨天',
    component: TimeAddPanel,
    hotkey: 'mod+5',
    keywords: ['时间加减', 'sjij', '时刻', '跨天', '闹钟', 'alarm'],
    inNav: true,
  },
  {
    id: 'timezone',
    label: '时区换算',
    short: '时区',
    icon: '🌍',
    description: '北京、纽约、伦敦、东京、UTC 互转，含会议时间重叠',
    component: TimezonePanel,
    hotkey: 'mod+6',
    keywords: ['时区', 'sq', '换算', '世界时钟', 'timezone', 'utc', 'gmt', '会议'],
    inNav: true,
  },
  {
    id: 'unix',
    label: '时间戳',
    short: '时间戳',
    icon: '#️⃣',
    description: 'Unix 时间戳与日期互转，自动识别秒 / 毫秒',
    component: UnixPanel,
    hotkey: 'mod+7',
    keywords: ['时间戳', 'sjt', 'unix', 'epoch', 'timestamp', '毫秒', '秒'],
    inNav: true,
  },
  {
    id: 'countdown',
    label: '倒计时',
    short: '倒计时',
    icon: '⏳',
    description: '距离某个时刻还有多久，到点提醒并可加入日历',
    component: CountdownPanel,
    hotkey: 'mod+8',
    keywords: ['倒计时', 'djs', '还有多久', 'countdown', '提醒', '纪念日'],
    inNav: true,
  },
  {
    id: 'history',
    label: '历史记录',
    short: '历史',
    icon: '🕘',
    description: '最近算过的内容，可收藏、搜索、一键回填',
    component: HistoryPanel,
    hotkey: 'mod+h',
    keywords: ['历史', 'ls', '记录', 'history', '收藏', '最近'],
    inNav: true,
  },
  {
    id: 'settings',
    label: '设置',
    short: '设置',
    icon: '⚙️',
    description: '主题、周起始日、节假日地区、快捷键与通知',
    component: SettingsPanel,
    hotkey: 'mod+,',
    keywords: ['设置', 'sz', '偏好', 'settings', '主题', 'theme', '快捷键'],
    inNav: true,
  },
  {
    id: 'about',
    label: '关于',
    short: '关于',
    icon: 'ℹ️',
    description: '版本信息、平台能力与安装说明',
    component: AboutPanel,
    keywords: ['关于', 'gy', '版本', 'about', 'version', '平台', '安装'],
    // 关于页不放主导航，从设置页底部进入
    inNav: false,
  },
];

/** 主导航（手机底栏 / 桌面侧栏）用的面板 */
export const NAV_PANELS: readonly PanelDefinition[] = PANELS.filter((panel) => panel.inNav);

const PANEL_MAP = new Map<PanelId, PanelDefinition>(PANELS.map((panel) => [panel.id, panel]));

export function findPanel(id: string): PanelDefinition | undefined {
  return PANEL_MAP.get(id as PanelId);
}

export function getPanel(id: PanelId): PanelDefinition {
  const panel = PANEL_MAP.get(id);
  if (!panel) throw new Error(`[timecalc] 未知面板：${id}`);
  return panel;
}

/** 是否为合法的面板 id（用于校验 URL hash 与历史记录里的 kind） */
export function isPanelId(value: string): value is PanelId {
  return PANEL_MAP.has(value as PanelId);
}

/** 带快捷键的面板。类型里把 hotkey 收窄成 string，调用方不必再判空 */
export type HotkeyPanel = PanelDefinition & { hotkey: string };

/** 所有带快捷键的面板，供 App 批量注册 */
export const HOTKEY_PANELS: readonly HotkeyPanel[] = PANELS.filter(
  (panel): panel is HotkeyPanel => Boolean(panel.hotkey),
);
