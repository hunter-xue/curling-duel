const TEAM_LABEL = { white: '白方', black: '黑方' };

export class Hud {
  constructor() {
    const $ = (id) => document.getElementById(id);

    this.el = {
      rowWhite: $('row-white'),
      rowBlack: $('row-black'),
      scoreWhite: $('score-white'),
      scoreBlack: $('score-black'),
      turnbar: $('turnbar'),
      turnText: $('turn-text'),
      power: $('power'),
      powerFill: $('power-fill'),
      powerVal: $('power-val'),
      overlay: $('overlay'),
      overlayCard: document.querySelector('.overlay-card'),
      overTitle: $('over-title'),
      overSub: $('over-sub'),
      btnAgain: $('btn-again'),
      btnRestart: $('btn-restart'),
      btnPanel: $('btn-panel'),
      panel: $('panel'),
    };

    this.mq = window.matchMedia('(max-width: 900px)');
    this.mq.addEventListener('change', () => this._syncPanel());
    this._syncPanel();
  }

  /* ── 面板 ─────────────────────────────────────────── */

  _syncPanel() {
    if (!this.mq.matches) this.el.panel.classList.remove('is-open');
  }

  isPanelVisible() {
    return !this.mq.matches || this.el.panel.classList.contains('is-open');
  }

  onPanelToggle(fn) {
    this.el.btnPanel.addEventListener('click', () => {
      this.el.panel.classList.toggle('is-open');
      fn?.(this.isPanelVisible());
    });
  }

  /* ── 分数 ─────────────────────────────────────────── */

  setScores(scores) {
    this.el.scoreWhite.textContent = String(scores.white);
    this.el.scoreBlack.textContent = String(scores.black);
  }

  /* ── 回合 ─────────────────────────────────────────── */

  setTurn(turn, phase = 'idle') {
    const white = turn === 'white';
    this.el.rowWhite.classList.toggle('is-active', white);
    this.el.rowBlack.classList.toggle('is-active', !white);
    this.el.turnbar.classList.toggle('is-black', !white);
    this.el.turnbar.classList.toggle('is-thinking', phase === 'simulating');

    if (phase === 'simulating') {
      this.el.turnText.textContent = '滑行中…';
    } else {
      this.el.turnText.textContent = `${TEAM_LABEL[turn]}回合 · 拖拽你的石子`;
    }
  }

  /* ── 力度 ─────────────────────────────────────────── */

  setPower(p, visible = true) {
    const v = Math.max(0, Math.min(1, p));
    this.el.powerFill.style.width = `${(v * 100).toFixed(1)}%`;
    this.el.powerVal.textContent = `${Math.round(v * 100)}%`;
    this.el.power.classList.toggle('is-on', visible && v > 0.001);
  }

  /* ── 结算 ─────────────────────────────────────────── */

  showOverlay(winner, scores) {
    const white = winner === 'white';
    this.el.overlayCard.classList.toggle('is-white', white);
    this.el.overlayCard.classList.toggle('is-black', !white);
    this.el.overTitle.textContent = `${TEAM_LABEL[winner]}获胜`;
    this.el.overSub.textContent = `${scores.white} : ${scores.black}`;
    this.el.overlay.hidden = false;
  }

  hideOverlay() {
    this.el.overlay.hidden = true;
  }

  /* ── 重开 ─────────────────────────────────────────── */

  onRestart(fn) {
    this.el.btnRestart.addEventListener('click', fn);
    this.el.btnAgain.addEventListener('click', fn);
  }
}
