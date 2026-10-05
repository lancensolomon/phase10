const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function game() {
  const element = () => ({ innerHTML: '', value: '', style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, focus() {}, addEventListener() {} });
  const elements = new Map();
  const getElement = id => {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  };
  const alerts = [];
  const saved = new Map();
  const context = vm.createContext({
    document: { getElementById: getElement, createElement: element, body: element() },
    window: { innerWidth: 400, addEventListener() {}, scrollTo() {} },
    navigator: {}, playerName: element(), scoreInputs: element(),
    localStorage: { removeItem: key => saved.delete(key), getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) },
    alert: message => alerts.push(message), confirm: () => true, setTimeout() {},
  });
  const html = fs.readFileSync(`${__dirname}/index.html`, 'utf8');
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], context);
  const run = code => vm.runInContext(code, context);
  run("players = [{ name: 'A', phase: 9, score: 100, matchWins: 0 }, { name: 'B', phase: 8, score: 0, matchWins: 0 }]");
  return { run, alerts };
}

test('going out on phase 9 starts phase 10 without awarding a win', () => {
  const { run, alerts } = game();
  run('wentOut(0); finaliseScores()');
  assert.equal(run('players[0].phase'), 10);
  assert.equal(run('players[0].matchWins'), 0);
  assert.equal(alerts.length, 0);
  assert.equal(run('whatPhaseNumber(10)'), '1 set of 5 + 1 set of 3');
});

test('manual phase 9 completion does not skip phase 10 when going out', () => {
  const { run, alerts } = game();
  run('changePhase(0, 1); wentOut(0); finaliseScores()');
  assert.equal(run('players[0].phase'), 10);
  assert.equal(alerts.length, 0);
});

test('going out on phase 10 awards a win', () => {
  const { run, alerts } = game();
  run('players[0].phase = 10; wentOut(0); finaliseScores()');
  assert.equal(run('players[0].matchWins'), 1);
  assert.equal(alerts.length, 1);
});

test('only phase 10 completers qualify, using scores after the round', () => {
  const { run, alerts } = game();
  run('players[0].phase = 10; players[1].phase = 10; players[1].score = 95; changePhase(1, 1); wentOut(0); roundScores[1].n = 2; finaliseScores()');
  assert.equal(run('players[0].matchWins'), 1);
  assert.equal(run('players[1].matchWins'), 0);
  assert.match(alerts[0], /A wins/);
});

test('completion can be reversed and survives reloading without double advancement', () => {
  const { run } = game();
  run('players[0].phase = 10; changePhase(0, 1); changePhase(0, -1)');
  assert.equal(run('players[0].phase'), 10);
  run('changePhase(0, 1); phaseAdvancedThisRound = {}; loadGame(); wentOut(0)');
  assert.equal(run('players[0].phase'), 11);
});

test('winner leaves the final board frozen, including after reload', () => {
  const { run, alerts } = game();
  run('players[0].phase = 10; wentOut(0); roundScores[1].n = 2; finaliseScores()');
  assert.equal(run('gameOver'), true);
  assert.equal(run('players[0].phase'), 11);
  assert.equal(run('players[0].score'), 100);
  assert.equal(run('players[1].score'), 10);
  run('loadGame(); changePhase(0, -1); wentOut(1); undoRound(); checkWinner()');
  assert.equal(run('gameOver'), true);
  assert.equal(run('players[0].phase'), 11);
  assert.equal(run('players[0].matchWins'), 1);
  assert.equal(alerts.length, 1);
});

test('lets go again resets phases and scores but keeps players and match wins', () => {
  const { run } = game();
  run('players[0].phase = 10; wentOut(0); finaliseScores(); resetScores()');
  assert.equal(run('gameOver'), false);
  assert.equal(run('players.length'), 2);
  assert.equal(run('players[0].phase'), 1);
  assert.equal(run('players[0].score'), 0);
  assert.equal(run('players[0].matchWins'), 1);
  assert.equal(run('history.length'), 0);
  run('wentOut(0); finaliseScores()');
  assert.equal(run('players[0].phase'), 2);
});

test('series winner also remains on the final board', () => {
  const { run } = game();
  run('players[0].phase = 10; players[0].matchWins = 1; wentOut(0); finaliseScores()');
  assert.equal(run('gameOver'), true);
  assert.equal(run('players[0].phase'), 11);
  assert.equal(run('players[0].matchWins'), 2);
});

test('setup accepts four phases and phase 3 does not end the game', () => {
  const { run, alerts } = game();
  run("phaseCountSelect.value = '4'; startGame(); players[0].phase = 3; players[1].phase = 2; wentOut(0); finaliseScores()");
  assert.equal(run('totalPhases'), 4);
  assert.equal(run('players[0].phase'), 4);
  assert.equal(run('gameOver'), false);
  assert.equal(alerts.length, 0);
});

test('four phase game finishes after phase 4 and stays frozen across reloads', () => {
  const { run, alerts } = game();
  run("phaseCountSelect.value = '4'; startGame(); players[0].phase = 4; players[1].phase = 3; wentOut(0); finaliseScores(); totalPhases = 10; loadGame()");
  assert.equal(run('totalPhases'), 4);
  assert.equal(run('players[0].phase'), 5);
  assert.equal(run('gameOver'), true);
  assert.match(alerts[0], /completed phase 4/);
  run('resetScores()');
  assert.equal(run('totalPhases'), 4);
  assert.equal(run('players[0].phase'), 1);
  assert.equal(run('players[0].matchWins'), 1);
});

test('manual final-phase completion and scores determine the shorter game winner', () => {
  const { run } = game();
  run('totalPhases = 4; players[0].phase = 4; players[1].phase = 4; players[1].score = 95; changePhase(0, 1); changePhase(1, 1); wentOut(0); roundScores[1].n = 2; finaliseScores()');
  assert.equal(run('players[0].phase'), 5);
  assert.equal(run('players[0].matchWins'), 1);
  assert.equal(run('players[1].matchWins'), 0);
});

test('one phase games end after phase 1; new game restores ten phase default', () => {
  const { run } = game();
  run('totalPhases = 1; players[0].phase = 1; players[1].phase = 1; wentOut(0); finaliseScores()');
  assert.equal(run('gameOver'), true);
  assert.equal(run('players[0].phase'), 2);
  run('newGame()');
  assert.equal(run('totalPhases'), 10);
  assert.equal(run('players.length'), 0);
});

test('legacy saves and invalid phase counts default to ten', () => {
  const { run } = game();
  for (const value of [undefined, null, '', 0, 11, 2.5, 'invalid']) {
    assert.equal(run('validPhaseCount(' + JSON.stringify(value) + ')'), 10);
  }
  run("localStorage.setItem('phase10Game', JSON.stringify({ players, history, gameOver })); totalPhases = 4; loadGame()");
  assert.equal(run('totalPhases'), 10);
});

test('equal lowest scores announce only tied final-phase completers', () => {
  const { run, alerts } = game();
  run("totalPhases = 4; players = [{ name: 'A', phase: 5, score: 50, matchWins: 0 }, { name: 'B', phase: 5, score: 50, matchWins: 0 }, { name: 'C', phase: 5, score: 60, matchWins: 0 }, { name: 'D', phase: 4, score: 0, matchWins: 0 }]; checkWinner(); renderGame()");
  assert.equal(run('gameOver'), false);
  assert.equal(run('tiePlayers.join()'), '0,1');
  assert.match(alerts[0], /A and B must replay phase 4/);
  assert.equal(run('players[0].matchWins'), 0);
  assert.equal(run('players[0].phase'), 4);
  assert.match(run('tieBanner.textContent'), /First to go out wins/);
  run('saveGame(); tiePlayers = []; loadGame(); wentOut(2); changePhase(0, 1); undoRound()');
  assert.equal(run('tiePlayers.join()'), '0,1');
  assert.equal(run('players[0].phase'), 4);
  run('wentOut(1)');
  assert.equal(run('gameOver'), true);
  assert.equal(run('players[1].matchWins'), 1);
  assert.equal(run('players[0].matchWins'), 0);
  assert.equal(run('players[1].score'), 50);
  assert.match(alerts[1], /B wins/);
  run('resetScores()');
  assert.equal(run('tiePlayers.length'), 0);
});

test('ten card limit applies across categories and permits correcting entries', () => {
  const { run } = game();
  run('wentOut(0); for (let i = 0; i < 6; i++) adjust(1, "n", 1); for (let i = 0; i < 4; i++) adjust(1, "w", 1); adjust(1, "s", 1); adjust(1, "t", 1)');
  assert.equal(run('cardCount(roundScores[1])'), 10);
  assert.equal(run('roundScores[1].s'), 0);
  assert.match(run('scoreInputs.innerHTML'), /disabled onclick="adjust/);
  run('adjust(1, "n", -1); adjust(1, "t", 1)');
  assert.equal(run('cardCount(roundScores[1])'), 10);
  assert.equal(run('roundScores[1].t'), 1);
});
