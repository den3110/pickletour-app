// utils/receiptHtml.ts — Dựng HTML hoá đơn (khổ 80mm) để in / xuất PDF qua expo-print
import { fmtVND } from "@/utils/courtFormat";

type Venue = { name?: string; address?: string; province?: string; phone?: string };
type SaleItem = { name: string; price: number; qty: number; lineTotal: number };
type Sale = {
  code?: string;
  items?: SaleItem[];
  total?: number;
  paymentMethod?: string;
  customerName?: string;
  note?: string;
  createdAt?: string;
};

const esc = (s: any) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

const dt = (iso?: string) => {
  try {
    return new Date(iso || Date.now()).toLocaleString("vi-VN", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return "";
  }
};

const PAY_LABEL: Record<string, string> = { cash: "Tiền mặt", transfer: "Chuyển khoản", package: "Gói/thẻ" };

const shell = (body: string) => `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; margin: 0; padding: 10px 12px; color: #111; width: 280px; }
  h1 { font-size: 17px; margin: 0; text-align: center; letter-spacing: .3px; }
  .muted { color: #555; }
  .center { text-align: center; }
  .sm { font-size: 11px; }
  .md { font-size: 12.5px; }
  .row { display: flex; justify-content: space-between; gap: 8px; }
  .dash { border-top: 1px dashed #999; margin: 8px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  td { padding: 3px 0; vertical-align: top; }
  .qty { text-align: center; width: 34px; color: #555; }
  .amt { text-align: right; white-space: nowrap; }
  .name { font-weight: 600; }
  .total { font-size: 16px; font-weight: 800; }
  .foot { text-align: center; margin-top: 10px; font-size: 11px; color: #666; }
</style></head><body>${body}</body></html>`;

/** Hoá đơn 1 đơn bán hàng. */
export function saleReceiptHtml(venue: Venue, sale: Sale): string {
  const items = sale.items || [];
  const lines = items
    .map(
      (it) => `<tr>
        <td class="name">${esc(it.name)}<div class="sm muted">${fmtVND(it.price)}</div></td>
        <td class="qty">${it.qty}</td>
        <td class="amt">${fmtVND(it.lineTotal)}</td>
      </tr>`,
    )
    .join("");
  const body = `
    <h1>${esc(venue.name || "PickleTour")}</h1>
    ${venue.address ? `<div class="center sm muted">${esc([venue.address, venue.province].filter(Boolean).join(", "))}</div>` : ""}
    ${venue.phone ? `<div class="center sm muted">ĐT: ${esc(venue.phone)}</div>` : ""}
    <div class="dash"></div>
    <div class="center md" style="font-weight:700">HOÁ ĐƠN BÁN HÀNG</div>
    <div class="row sm muted" style="margin-top:4px"><span>Số: ${esc(sale.code || "")}</span><span>${dt(sale.createdAt)}</span></div>
    ${sale.customerName ? `<div class="sm muted">Khách: ${esc(sale.customerName)}</div>` : ""}
    <div class="dash"></div>
    <table><tbody>${lines}</tbody></table>
    <div class="dash"></div>
    <div class="row total"><span>TỔNG CỘNG</span><span>${fmtVND(sale.total || 0)}</span></div>
    <div class="row sm muted" style="margin-top:4px"><span>Thanh toán</span><span>${PAY_LABEL[sale.paymentMethod || "cash"] || "Tiền mặt"}</span></div>
    ${sale.note ? `<div class="sm muted" style="margin-top:6px">Ghi chú: ${esc(sale.note)}</div>` : ""}
    <div class="foot">Cảm ơn quý khách!<br/>Powered by PickleTour</div>
  `;
  return shell(body);
}

/** Báo cáo bán hàng trong ngày (nhiều đơn). */
export function salesReportHtml(venue: Venue, date: string, sales: Sale[], grandTotal: number): string {
  const rows = sales
    .map(
      (s) => `<tr>
        <td class="name">${esc(s.code || "")}<div class="sm muted">${dt(s.createdAt)}</div></td>
        <td class="qty">${(s.items || []).reduce((a, b) => a + b.qty, 0)}</td>
        <td class="amt">${fmtVND(s.total || 0)}</td>
      </tr>`,
    )
    .join("");
  const body = `
    <h1>${esc(venue.name || "PickleTour")}</h1>
    <div class="center md" style="font-weight:700; margin-top:6px">BÁO CÁO BÁN HÀNG</div>
    <div class="center sm muted">Ngày ${esc(date.split("-").reverse().join("/"))}</div>
    <div class="dash"></div>
    <table><tbody>${rows || '<tr><td class="center muted sm">Không có đơn</td></tr>'}</tbody></table>
    <div class="dash"></div>
    <div class="row sm muted"><span>Số đơn</span><span>${sales.length}</span></div>
    <div class="row total"><span>TỔNG THU</span><span>${fmtVND(grandTotal)}</span></div>
    <div class="foot">Powered by PickleTour</div>
  `;
  return shell(body);
}
