/* ============================================================
   ai-config.js —— DeepSeek AI 配置（可选功能）

   apiKey 留空时，AI 功能不可用，但程序其他部分完全正常。

   怎么填：
     方式一（推荐）：在程序「资料」页的「AI 分析」里填，存你浏览器里
     方式二：直接在下面引号里填

   申请地址：https://platform.deepseek.com
   ============================================================ */

const AI_CONFIG = {
  apiKey: '',                                  // 形如 sk-xxxxxxxx
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat'
};