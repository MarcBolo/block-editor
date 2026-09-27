import type { TurnIntoItem } from './types';

export const HANDLE_W = 20;
export const HANDLE_H = 20;

/** 「转换为」菜单项 */
export const TURN_INTO: TurnIntoItem[] = [
  ['paragraph', '正文'],
  ['h1', '标题 1'],
  ['h2', '标题 2'],
  ['h3', '标题 3'],
  ['h4', '标题 4'],
  ['h5', '标题 5'],
  ['h6', '标题 6'],
  ['ul', '无序列表'],
  ['ol', '有序列表'],
  ['todo', '待办清单'],
  ['quote', '引用'],
  ['callout', 'Callout'],
  ['toggle', '折叠块'],
  ['code', '代码块'],
  ['mermaid', 'Mermaid 图'],
  ['math', '数学公式'],
  ['table', '表格'],
  ['divider', '分割线'],
  // M5：常用代码语言可直接作为块类型（转出即代码块 + 语言标记）
  ['html', 'HTML 代码'],
  ['css', 'CSS 代码'],
  ['js', 'JavaScript 代码'],
  ['json', 'JSON 数据'],
  ['yaml', 'YAML 数据'],
];

/** 块 ID 的词表：Obsidian 只认拉丁字母、数字和连字符，所以用「易拼写的短单词 + 序号」 */
export const ID_WORDS = [
  'amber', 'anchor', 'arbor', 'aspen', 'autumn', 'bamboo', 'beacon', 'birch', 'bloom', 'breeze',
  'brook', 'candle', 'canyon', 'cedar', 'cherry', 'cinder', 'clover', 'coral', 'cotton', 'dawn',
  'delta', 'drizzle', 'dusk', 'ember', 'falcon', 'fable', 'fern', 'flint', 'forest', 'frost',
  'garden', 'glacier', 'harbor', 'harvest', 'hazel', 'hollow', 'honey', 'indigo', 'ivory', 'jade',
  'lantern', 'linden', 'meadow', 'meteor', 'mirror', 'mist', 'nectar', 'north', 'orchid', 'pebble',
  'pepper', 'pine', 'pond', 'poppy', 'quartz', 'quill', 'raven', 'ribbon', 'river', 'saffron',
  'shadow', 'shell', 'silver', 'snow', 'spark', 'spring', 'stone', 'storm', 'summit', 'sunset',
  'thistle', 'tide', 'timber', 'valley', 'velvet', 'violet', 'walnut', 'willow', 'winter', 'zephyr',
];

/** Obsidian 官方 Callout 类型（canonical 名称，菜单用） */
export const CALLOUT_TYPES: [string, string][] = [
  ['note', '备注'],
  ['abstract', '摘要'],
  ['todo', '待办'],
  ['tip', '提示'],
  ['success', '成功'],
  ['question', '问题'],
  ['warning', '警告'],
  ['failure', '失败'],
  ['danger', '危险'],
  ['bug', '缺陷'],
  ['example', '示例'],
  ['quote', '引用'],
  // M5：更多官方 callout 类型
  ['cite', '引文'],
  ['info', '信息'],
  ['help', '帮助'],
  ['check', '完成'],
  ['cross', '否定'],
  ['key', '要点'],
  ['pencil', '笔记'],
  ['search', '检索'],
  ['love', '喜欢'],
  ['rocket', '启动'],
  ['image', '图片'],
  ['location', '位置'],
  ['home', '主页'],
  ['target', '目标'],
];

/** 代码块语言 */
export const CODE_LANGS: [string, string][] = [
  ['', '纯文本'],
  ['js', 'JavaScript'],
  ['ts', 'TypeScript'],
  ['python', 'Python'],
  ['java', 'Java'],
  ['c', 'C / C++'],
  ['go', 'Go'],
  ['rust', 'Rust'],
  ['sql', 'SQL'],
  ['bash', 'Bash'],
  ['json', 'JSON'],
  ['yaml', 'YAML'],
  ['html', 'HTML'],
  ['css', 'CSS'],
  ['mermaid', 'Mermaid'],
  // M5：代码语言扩展
  ['cpp', 'C++'],
  ['csharp', 'C#'],
  ['php', 'PHP'],
  ['ruby', 'Ruby'],
  ['swift', 'Swift'],
  ['kotlin', 'Kotlin'],
  ['dart', 'Dart'],
  ['shell', 'Shell'],
  ['powershell', 'PowerShell'],
  ['latex', 'LaTeX'],
  ['docker', 'Dockerfile'],
  ['xml', 'XML'],
  ['scss', 'SCSS'],
  ['less', 'Less'],
  ['graphql', 'GraphQL'],
];
