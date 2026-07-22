/**
 * Regression — CỔNG: mã tự sinh <TẦNG>-<IN|OUT> (không nhập tay) + mỗi tầng chỉ 1 IN + 1 OUT.
 * Kèm: cổng KHÔNG còn gắn loại xe (đã bỏ cột vehicle_type_id).
 *
 * Chạy:  node scripts/testGateCodeAutoGen.js   (trong thư mục server) — TỰ DỌN fixture.
 */
import dotenv from 'dotenv';
import sequelize from '../src/config/db.js';
import { Floor, Gate } from '../src/models/index.js';
import { createGate, updateGate, deleteGate } from '../src/services/gate.service.js';
import { buildGateCode } from '../src/utils/gateCode.js';

let pass = 0;
let fail = 0;
const ok = (cond, msg) => { cond ? pass++ : fail++; console.log(`  ${cond ? 'PASS' : 'FAIL'} | ${msg}`); };
const grab = async (fn) => { try { return { ok: true, val: await fn() }; } catch (e) { return { ok: false, status: e.statusCode, code: e.code, msg: e.message }; } };

const FCODE = 'ZGATE';
const cleanup = async () => {
  const floor = await Floor.findOne({ where: { floor_code: FCODE } });
  if (!floor) return;
  await Gate.destroy({ where: { floor_id: floor.floor_id } });
  await Floor.destroy({ where: { floor_id: floor.floor_id } });
};

const run = async () => {
  await sequelize.authenticate();
  console.log('DB connected. Test mã cổng tự sinh...\n');
  await cleanup();

  const floor = await Floor.create({
    floor_code: FCODE, floor_level: 95, label: 'Tầng test cổng', layout_mode: 'zoned', area_m2: null,
  });

  console.log('① buildGateCode:');
  ok(buildGateCode(floor, 'in') === 'ZGATE-IN', `floor IN → ${buildGateCode(floor, 'in')}`);
  ok(buildGateCode(null, 'out') === 'BLD-OUT', `tòa OUT → ${buildGateCode(null, 'out')}`);

  console.log('\n② createGate tự sinh mã, BỎ QUA gateCode client gửi:');
  const g1 = await createGate({ floorId: floor.floor_id, direction: 'in', gateCode: 'HACK-NHAP-TAY' });
  ok(g1.gate_code === 'ZGATE-IN', `mã sinh = ${g1.gate_code} (bỏ qua 'HACK-NHAP-TAY')`);

  console.log('\n③ Mỗi tầng chỉ 1 cổng IN:');
  const dup = await grab(() => createGate({ floorId: floor.floor_id, direction: 'in' }));
  ok(dup.ok === false && dup.status === 409, `cổng IN thứ 2 bị chặn 409 (${dup.code})`);

  console.log('\n④ Cổng OUT cùng tầng OK, mã khác:');
  const g2 = await createGate({ floorId: floor.floor_id, direction: 'out' });
  ok(g2.gate_code === 'ZGATE-OUT', `mã OUT = ${g2.gate_code}`);

  console.log('\n⑤ Không còn field vehicle_type_id trên cổng:');
  ok(g1.vehicle_type_id === undefined, 'gate không có thuộc tính vehicle_type_id');

  console.log('\n⑥ updateGate đổi hướng → sinh lại mã (xóa g2 để không đụng single-direction):');
  await deleteGate(g2.gate_id);
  const g1u = await updateGate(g1.gate_id, { direction: 'out' });
  ok(g1u.gate_code === 'ZGATE-OUT', `đổi IN→OUT, mã sinh lại = ${g1u.gate_code}`);

  await cleanup();
  console.log(`\n==== KẾT QUẢ: ${pass} PASS / ${fail} FAIL ====`);
};

run()
  .catch((err) => { console.error('\nLỗi chạy test:', err.message); fail++; })
  .finally(async () => { await cleanup().catch(() => {}); await sequelize.close(); process.exit(fail > 0 ? 1 : 0); });
