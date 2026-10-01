/**
 * dsh-desktop-ui-reasoning-effort, host half.
 *
 * All behavior lives in the browser half (lib/client.js), which edits the
 * `llm-pi-ai` settings namespace through the existing settings Remote. The
 * Host only needs a live Loader entry so the client bundle is served.
 */
export const name = 'dsh-desktop-ui-reasoning-effort'

export function apply() {}
