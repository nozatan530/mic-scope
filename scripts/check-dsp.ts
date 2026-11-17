// 音の計算（振動数・音名とセント・なめらか度・「—」を出す条件）の自己チェック。
// docs/studio-prompt.md の「計算の確かめ」を、合成した波形で確かめる。
// 実行: npm run check:dsp（1つでも FAIL があれば終了コード 1）
import { runDspSelfTests } from '../src/dsp';

const report = runDspSelfTests();
for (const item of report.items) {
  console.log(`${item.passed ? 'PASS' : 'FAIL'}  ${item.name}  ${item.detail}`);
}
const passed = report.items.filter((i) => i.passed).length;
console.log(`\n${passed} / ${report.items.length} 項目 PASS`);
if (!report.allPassed) process.exit(1);
