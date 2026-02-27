/**
 * Generate the toolbar HTML to be injected into the equipment UI.
 */
export function buildToolbarHtml(sessionId: string): string {
    return `
<!-- OpenTurn Remote UI Toolbar -->
<div id="openturn-remote-toolbar" style="
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 999999;
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
    color: #e0e0e0;
    padding: 8px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 13px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    border-bottom: 1px solid rgba(255,255,255,0.08);
">
    <div style="display: flex; align-items: center; gap: 12px;">
        <span style="font-weight: 600; color: #4fc3f7;">⚡ OpenTurn Remote</span>
        <span style="opacity: 0.6; font-size: 11px;">Sessão: ${sessionId.substring(0, 8)}...</span>
    </div>
    <div style="display: flex; gap: 8px;">
        <button onclick="window.history.back()" style="
            background: rgba(255,255,255,0.1);
            border: 1px solid rgba(255,255,255,0.15);
            color: #e0e0e0;
            padding: 5px 14px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 12px;
            transition: background 0.2s;
        " onmouseover="this.style.background='rgba(255,255,255,0.2)'"
          onmouseout="this.style.background='rgba(255,255,255,0.1)'">
            ← Voltar
        </button>
        <button onclick="fetch('/remote/s/${sessionId}/__close', {method:'POST'}).then(()=>window.close())" style="
            background: rgba(239,83,80,0.2);
            border: 1px solid rgba(239,83,80,0.4);
            color: #ef5350;
            padding: 5px 14px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 12px;
            transition: background 0.2s;
        " onmouseover="this.style.background='rgba(239,83,80,0.35)'"
          onmouseout="this.style.background='rgba(239,83,80,0.2)'">
            ✕ Encerrar Sessão
        </button>
    </div>
</div>
<div style="height: 40px;"></div>
<!-- /OpenTurn Remote UI Toolbar -->
`;
}
