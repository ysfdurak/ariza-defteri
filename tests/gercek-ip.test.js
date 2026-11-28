// Gerçek IP: istemcinin yazdığı X-Forwarded-For / CF-Connecting-IP başlığıyla kullanım sınırları aşılamaz.
import test from 'node:test';
import assert from 'node:assert/strict';
import { gercekIp } from '../server/gercek-ip.js';

test('gerçek IP yalnız güvenilen vekilden okunur', () => {
  const r = (soket, h = {}) => gercekIp({ socket: { remoteAddress: soket }, headers: h });
  // Doğrudan internetten gelen istek: başlıklar yok sayılır.
  assert.equal(r('203.0.113.9', { 'x-forwarded-for': '1.1.1.1', 'cf-connecting-ip': '2.2.2.2' }), '203.0.113.9');
  // Caddy arkası (özel ağ), Cloudflare yok: XFF'nin son elemanı; sahte CF başlığı yok sayılır.
  assert.equal(r('172.18.0.5', { 'x-forwarded-for': '203.0.113.9', 'cf-connecting-ip': '9.9.9.9' }), '203.0.113.9');
  assert.equal(r('::ffff:172.18.0.5', { 'x-forwarded-for': '5.5.5.5, 203.0.113.9' }), '203.0.113.9');
  // Caddy arkası, bağlantı Cloudflare'den: CF-Connecting-IP kullanılır.
  assert.equal(r('172.18.0.5', { 'x-forwarded-for': '162.158.1.2', 'cf-connecting-ip': '198.51.100.7' }), '198.51.100.7');
  assert.equal(r('172.18.0.5', { 'x-forwarded-for': '2606:4700::1', 'cf-connecting-ip': '2001:db8::5' }), '2001:db8::5');
  // Geçersiz başlıklar
  assert.equal(r('172.18.0.5', { 'x-forwarded-for': 'çöp' }), '172.18.0.5');
  assert.equal(r('172.18.0.5', { 'x-forwarded-for': '162.158.1.2', 'cf-connecting-ip': 'çöp' }), '162.158.1.2');
});

test('icAgMi: Docker iç ağından doğrudan gelen servis iç ağdır, Caddy üzerinden gelen ziyaretçi değildir', async () => {
  const { icAgMi } = await import('../server/gercek-ip.js');
  const istek = (soket, basliklar = {}) => ({ socket: { remoteAddress: soket }, headers: basliklar });
  assert.equal(icAgMi(istek('172.18.0.5')), true, 'Nabız konteyneri');
  assert.equal(icAgMi(istek('::ffff:172.18.0.5')), true);
  assert.equal(icAgMi(istek('172.18.0.2', { 'x-forwarded-for': '203.0.113.7' })), false, 'Caddy arkasındaki dış ziyaretçi');
  assert.equal(icAgMi(istek('172.18.0.2', { 'x-forwarded-for': '162.158.1.1', 'cf-connecting-ip': '203.0.113.7' })), false, 'Cloudflare üzerinden');
  assert.equal(icAgMi(istek('172.18.0.2', { 'x-forwarded-for': '10.0.0.9, 203.0.113.7' })), false, 'sahte özel adres öne yazılamaz');
  assert.equal(icAgMi(istek('203.0.113.7', { 'x-forwarded-for': '10.0.0.9' })), false, 'dışarıdan gelen başlık yok sayılır');
});
