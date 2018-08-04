import test from 'ava';
import { useSpectron, } from './helpers/spectron/index';
import { getClient } from './helpers/api-client';


useSpectron();


test('Troubleshooter notifications', async t => {
  const app = t.context.app;
  const client = await getClient();
  const performanceMonitor = client.getResource('PerformanceMonitorService');

  t.false(await app.client.waitForExist('.notification.warning', 10 * 10000));

  performanceMonitor.pushLaggedFramesNotify(0.5);

  t.true(await app.client.waitForExist('.notification.warning', 10 * 10000));
});
