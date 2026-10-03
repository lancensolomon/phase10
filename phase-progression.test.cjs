const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function game() {
  const element = () => ({ innerHTML: '', value: '', style: {}, classList: { add() {}, remove() {} }, appendChild() {}, focus() {}, addEventListener() {} });
  const alerts = [];
  const saved = new Map();
  const context = vm.createContext({
    document: { getElementById: element, createElement: element, body: element() },
    window: { innerWidth: 400, addEventListener() {}, scrollTo() {} },
    navigator: {}, playerName: element(), scoreInputs: element(),
    localStorage: { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) },
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
