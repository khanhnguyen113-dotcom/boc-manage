import { lookup as dnsLookup } from 'node:dns';

import { Agent, setGlobalDispatcher } from 'undici';

/**
 * Ghi đè phân giải DNS cho **đúng một hostname** của Appwrite — xem ADR-016.
 *
 * Lý do tồn tại: một số mạng (ISP, firewall doanh nghiệp) chặn hoặc cướp DNS của tên miền
 * wildcard như `sslip.io`, khiến máy lập trình không phân giải được endpoint Appwrite self-hosted
 * dù server vẫn hoạt động bình thường. Đây là “file hosts ở phạm vi tiến trình”: chỉ đổi bước
 * tra IP, không đụng tới URL, Host header hay TLS.
 *
 * `node-appwrite` gọi `fetch` của package `undici`, nên đặt global dispatcher của cùng instance
 * undici là có hiệu lực.
 *
 * **Mặc định tắt.** Chỉ bật khi cả hai biến sau cùng có giá trị:
 *   APPWRITE_RESOLVE_HOST=masterapp-appwrite-xxx.sslip.io
 *   APPWRITE_RESOLVE_IP=103.142.27.229
 *
 * Production **không** dùng cơ chế này: hạ tầng thật phải có DNS đúng và HTTPS.
 */

let installed = false;

export function installAppwriteDnsOverride(): { active: boolean; detail: string } {
  const targetHost = process.env.APPWRITE_RESOLVE_HOST?.trim();
  const targetIp = process.env.APPWRITE_RESOLVE_IP?.trim();

  if (!targetHost || !targetIp) {
    return { active: false, detail: 'Không cấu hình — dùng DNS của hệ thống.' };
  }

  if (installed) {
    return { active: true, detail: `${targetHost} → ${targetIp} (đã cài trước đó)` };
  }

  const agent = new Agent({
    connect: {
      lookup(hostname, options, callback) {
        if (hostname !== targetHost) {
          // Mọi hostname khác đi theo DNS bình thường của hệ thống.
          dnsLookup(hostname, options, callback);
          return;
        }
        // `all: true` trả về mảng; undici gọi với cả hai dạng tuỳ phiên bản.
        if (options && typeof options === 'object' && options.all) {
          callback(null, [{ address: targetIp, family: 4 }] as never);
        } else {
          callback(null, targetIp as never, 4 as never);
        }
      },
    },
  });

  setGlobalDispatcher(agent);
  installed = true;

  return { active: true, detail: `${targetHost} → ${targetIp}` };
}
