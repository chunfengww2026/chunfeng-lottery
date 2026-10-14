/* ============================================================
   ai-config.js —— DeepSeek AI 配置（可选功能）

   apiKey 留空时，AI 功能不可用，但程序其他部分完全正常。

   怎么填：
     方式一（推荐）：在程序「资料」页的「AI 分析」里填，存你浏览器里
     方式二：直接在下面引号里填

   申请地址：https://platform.deepseek.com
   ============================================================ */

const AI_CONFIG = {
  apiKey: 'sk-726ce9be7c8148d3816c314b14426ebb',                                  // 形如 sk-xxxxxxxx
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',

  /* reasoningEffort：只用于「智能助手」页面上显示「推理强度」。
     【如实说明】DeepSeek 的 /chat/completions 接口【没有】reasoning_effort
     这个入参（传了会被 400 拒绝），所以这个值不会发出去，纯展示用。
     可选：'low' | 'medium' | 'high'，默认 'medium'。 */
  reasoningEffort: 'medium'
};