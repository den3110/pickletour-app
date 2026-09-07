/**
 * Danh sách ngân hàng hỗ trợ VietQR. `bin` là mã BIN NAPAS 6 số dùng để dựng URL QR.
 * Nguồn: SePay banklogo + NAPAS BIN list (2026).
 * Logo file được đóng gói trong /assets/banks/{file}.
 */
export interface Bank {
  code: string;         // Short code (ACB, VCB, ...)
  bin: string;          // NAPAS BIN
  name: string;         // Tên hiển thị
  subtitle: string;     // Tên đầy đủ
  logoFile: string;     // File asset trong /assets/banks
}

export const BANKS: Bank[] = [
  { code: 'VCB', bin: '970436', name: 'Vietcombank', subtitle: 'Ngân hàng TMCP Ngoại Thương Việt Nam', logoFile: 'VCB.png' },
  { code: 'ICB', bin: '970415', name: 'VietinBank', subtitle: 'Ngân hàng TMCP Công thương Việt Nam', logoFile: 'ICB.png' },
  { code: 'MB', bin: '970422', name: 'MBBank', subtitle: 'Ngân hàng TMCP Quân đội', logoFile: 'MB.png' },
  { code: 'ACB', bin: '970416', name: 'ACB', subtitle: 'Ngân hàng TMCP Á Châu', logoFile: 'ACB.png' },
  { code: 'VPB', bin: '970432', name: 'VPBank', subtitle: 'Ngân hàng TMCP Việt Nam Thịnh Vượng', logoFile: 'VPB.png' },
  { code: 'TPB', bin: '970423', name: 'TPBank', subtitle: 'Ngân hàng TMCP Tiên Phong', logoFile: 'TPB.png' },
  { code: 'MSB', bin: '970426', name: 'MSB', subtitle: 'Ngân hàng TMCP Hàng Hải Việt Nam', logoFile: 'MSB.png' },
  { code: 'NAB', bin: '970428', name: 'NamABank', subtitle: 'Ngân hàng TMCP Nam Á', logoFile: 'NAB.png' },
  { code: 'LPB', bin: '970449', name: 'LPBank', subtitle: 'Ngân hàng TMCP Lộc Phát Việt Nam', logoFile: 'LPB.png' },
  { code: 'VCCB', bin: '970454', name: 'BVBank', subtitle: 'Ngân hàng TMCP Bản Việt', logoFile: 'VCCB.png' },
  { code: 'BIDV', bin: '970418', name: 'BIDV', subtitle: 'Ngân hàng TMCP Đầu tư và Phát triển Việt Nam', logoFile: 'BIDV.png' },
  { code: 'STB', bin: '970403', name: 'Sacombank', subtitle: 'Ngân hàng TMCP Sài Gòn Tài Lộc', logoFile: 'STB.png' },
  { code: 'VIB', bin: '970441', name: 'VIB', subtitle: 'Ngân hàng TMCP Quốc tế Việt Nam', logoFile: 'VIB.png' },
  { code: 'HDB', bin: '970437', name: 'HDBank', subtitle: 'Ngân hàng TMCP Phát triển Thành phố Hồ Chí Minh', logoFile: 'HDB.png' },
  { code: 'SEAB', bin: '970440', name: 'SeABank', subtitle: 'Ngân hàng TMCP Đông Nam Á', logoFile: 'SEAB.png' },
  { code: 'GPB', bin: '970408', name: 'GPBank', subtitle: 'Thương mại TNHH MTV Kỷ Nguyên Thịnh Vượng', logoFile: 'GPB.png' },
  { code: 'PVCB', bin: '970412', name: 'PVcomBank', subtitle: 'Ngân hàng TMCP Đại Chúng Việt Nam', logoFile: 'PVCB.png' },
  { code: 'NCB', bin: '970419', name: 'NCB', subtitle: 'Ngân hàng TMCP Quốc Dân', logoFile: 'NCB.png' },
  { code: 'SHBVN', bin: '970424', name: 'ShinhanBank', subtitle: 'Ngân hàng TNHH MTV Shinhan Việt Nam', logoFile: 'SHBVN.png' },
  { code: 'SCB', bin: '970429', name: 'SCB', subtitle: 'Ngân hàng TMCP Sài Gòn', logoFile: 'SCB.png' },
  { code: 'PGB', bin: '970430', name: 'PGBank', subtitle: 'Ngân hàng TMCP Thịnh vượng và Phát triển', logoFile: 'PGB.png' },
  { code: 'VBA', bin: '970405', name: 'Agribank', subtitle: 'Ngân hàng Nông nghiệp và Phát triển Nông thôn Việt Nam', logoFile: 'VBA.png' },
  { code: 'TCB', bin: '970407', name: 'Techcombank', subtitle: 'Ngân hàng TMCP Kỹ thương Việt Nam', logoFile: 'TCB.png' },
  { code: 'SGICB', bin: '970400', name: 'SaigonBank', subtitle: 'Ngân hàng TMCP Sài Gòn Công Thương', logoFile: 'SGICB.png' },
  { code: 'DOB', bin: '970406', name: 'Vikki', subtitle: 'Ngân hàng TNHH MTV Số Vikki', logoFile: 'DOB.png' },
  { code: 'BAB', bin: '970409', name: 'BacABank', subtitle: 'Ngân hàng TMCP Bắc Á', logoFile: 'BAB.png' },
  { code: 'SCVN', bin: '970410', name: 'StandardChartered', subtitle: 'Ngân hàng TNHH MTV Standard Chartered Bank Việt Nam', logoFile: 'SCVN.png' },
  { code: 'Oceanbank', bin: '970414', name: 'MBV', subtitle: 'Ngân hàng TNHH MTV Việt Nam Hiện Đại (Oceanbank)', logoFile: 'Oceanbank.png' },
  { code: 'VRB', bin: '970421', name: 'VRB', subtitle: 'Ngân hàng Liên doanh Việt - Nga', logoFile: 'VRB.png' },
  { code: 'ABB', bin: '970425', name: 'ABBANK', subtitle: 'Ngân hàng TMCP An Bình', logoFile: 'ABB.png' },
  { code: 'VAB', bin: '970427', name: 'VietABank', subtitle: 'Ngân hàng TMCP Việt Á', logoFile: 'VAB.png' },
  { code: 'EIB', bin: '970431', name: 'Eximbank', subtitle: 'Ngân hàng TMCP Xuất Nhập khẩu Việt Nam', logoFile: 'EIB.png' },
  { code: 'VIETBANK', bin: '970433', name: 'VietBank', subtitle: 'Ngân hàng TMCP Việt Nam Thương Tín', logoFile: 'VIETBANK.png' },
  { code: 'IVB', bin: '970434', name: 'IndovinaBank', subtitle: 'Ngân hàng TNHH Indovina', logoFile: 'IVB.png' },
  { code: 'BVB', bin: '970438', name: 'BaoVietBank', subtitle: 'Ngân hàng TMCP Bảo Việt', logoFile: 'BVB.png' },
  { code: 'PBVN', bin: '970439', name: 'PublicBank', subtitle: 'Ngân hàng TNHH MTV Public Việt Nam', logoFile: 'PBVN.png' },
  { code: 'SHB', bin: '970443', name: 'SHB', subtitle: 'Ngân hàng TMCP Sài Gòn - Hà Nội', logoFile: 'SHB.png' },
  { code: 'CBB', bin: '970444', name: 'CBBank', subtitle: 'Ngân hàng Thương mại TNHH MTV Xây dựng Việt Nam', logoFile: 'CBB.png' },
  { code: 'OCB', bin: '970448', name: 'OCB', subtitle: 'Ngân hàng TMCP Phương Đông', logoFile: 'OCB.png' },
  { code: 'KLB', bin: '970452', name: 'KienLongBank', subtitle: 'Ngân hàng TMCP Kiên Long', logoFile: 'KLB.png' },
  { code: 'CIMB', bin: '422589', name: 'CIMB', subtitle: 'Ngân hàng TNHH MTV CIMB Việt Nam', logoFile: 'CIMB.png' },
  { code: 'HSBC', bin: '458761', name: 'HSBC', subtitle: 'Ngân hàng TNHH MTV HSBC (Việt Nam)', logoFile: 'HSBC.png' },
  { code: 'DBS', bin: '796500', name: 'DBSBank', subtitle: 'DBS Bank Ltd - Chi nhánh Thành phố Hồ Chí Minh', logoFile: 'DBS.png' },
  { code: 'NHB_HN', bin: '801011', name: 'Nonghyup', subtitle: 'Ngân hàng Nonghyup - Chi nhánh Hà Nội', logoFile: 'NHB_HN.png' },
  { code: 'HLBVN', bin: '970442', name: 'HongLeong', subtitle: 'Ngân hàng TNHH MTV Hong Leong Việt Nam', logoFile: 'HLBVN.png' },
  { code: 'IBK', bin: '970456', name: 'IBK Bank', subtitle: 'Ngân hàng Công nghiệp Hàn Quốc', logoFile: 'IBK.png' },
  { code: 'WVN', bin: '970457', name: 'Woori', subtitle: 'Ngân hàng TNHH MTV Woori Việt Nam', logoFile: 'WVN.png' },
  { code: 'UOB', bin: '970458', name: 'UnitedOverseas', subtitle: 'Ngân hàng United Overseas - Chi nhánh TP. Hồ Chí Minh', logoFile: 'UOB.png' },
  { code: 'KBHN', bin: '970462', name: 'KookminHN', subtitle: 'Ngân hàng Kookmin - Chi nhánh Hà Nội', logoFile: 'KBHN.png' },
  { code: 'KBHCM', bin: '970463', name: 'KookminHCM', subtitle: 'Ngân hàng Kookmin - Chi nhánh Thành phố Hồ Chí Minh', logoFile: 'KBHCM.png' },
  { code: 'COOPBANK', bin: '970446', name: 'COOPBANK', subtitle: 'Ngân hàng Hợp tác xã Việt Nam', logoFile: 'COOPBANK.png' },
  { code: 'MOMO', bin: '', name: 'MoMo', subtitle: 'CTCP Dịch Vụ Di Động Trực Tuyến', logoFile: 'MOMO.png' },
];

export const findBank = (code?: string) => BANKS.find((b) => b.code === code);

/**
 * Bảng require() static cho React Native — Metro cần literal path để bundle asset.
 * Nếu thêm bank mới, thêm entry mới ở đây.
 */
export const BANK_LOGOS: Record<string, any> = {
  VCB: require('../assets/banks/VCB.png'),
  ICB: require('../assets/banks/ICB.png'),
  MB: require('../assets/banks/MB.png'),
  ACB: require('../assets/banks/ACB.png'),
  VPB: require('../assets/banks/VPB.png'),
  TPB: require('../assets/banks/TPB.png'),
  MSB: require('../assets/banks/MSB.png'),
  NAB: require('../assets/banks/NAB.png'),
  LPB: require('../assets/banks/LPB.png'),
  VCCB: require('../assets/banks/VCCB.png'),
  BIDV: require('../assets/banks/BIDV.png'),
  STB: require('../assets/banks/STB.png'),
  VIB: require('../assets/banks/VIB.png'),
  HDB: require('../assets/banks/HDB.png'),
  SEAB: require('../assets/banks/SEAB.png'),
  GPB: require('../assets/banks/GPB.png'),
  PVCB: require('../assets/banks/PVCB.png'),
  NCB: require('../assets/banks/NCB.png'),
  SHBVN: require('../assets/banks/SHBVN.png'),
  SCB: require('../assets/banks/SCB.png'),
  PGB: require('../assets/banks/PGB.png'),
  VBA: require('../assets/banks/VBA.png'),
  TCB: require('../assets/banks/TCB.png'),
  SGICB: require('../assets/banks/SGICB.png'),
  DOB: require('../assets/banks/DOB.png'),
  BAB: require('../assets/banks/BAB.png'),
  SCVN: require('../assets/banks/SCVN.png'),
  Oceanbank: require('../assets/banks/Oceanbank.png'),
  VRB: require('../assets/banks/VRB.png'),
  ABB: require('../assets/banks/ABB.png'),
  VAB: require('../assets/banks/VAB.png'),
  EIB: require('../assets/banks/EIB.png'),
  VIETBANK: require('../assets/banks/VIETBANK.png'),
  IVB: require('../assets/banks/IVB.png'),
  BVB: require('../assets/banks/BVB.png'),
  PBVN: require('../assets/banks/PBVN.png'),
  SHB: require('../assets/banks/SHB.png'),
  CBB: require('../assets/banks/CBB.png'),
  OCB: require('../assets/banks/OCB.png'),
  KLB: require('../assets/banks/KLB.png'),
  CIMB: require('../assets/banks/CIMB.png'),
  HSBC: require('../assets/banks/HSBC.png'),
  DBS: require('../assets/banks/DBS.png'),
  NHB_HN: require('../assets/banks/NHB_HN.png'),
  HLBVN: require('../assets/banks/HLBVN.png'),
  IBK: require('../assets/banks/IBK.png'),
  WVN: require('../assets/banks/WVN.png'),
  UOB: require('../assets/banks/UOB.png'),
  KBHN: require('../assets/banks/KBHN.png'),
  KBHCM: require('../assets/banks/KBHCM.png'),
  COOPBANK: require('../assets/banks/COOPBANK.png'),
  MOMO: require('../assets/banks/MOMO.png'),
};

/**
 * Dựng URL VietQR (dùng https://vietqr.app/img — không cần key, đơn giản).
 *
 * QUAN TRỌNG: `vietqr.app` nhận **tên đầy đủ** của ngân hàng ở param `bank`
 * (ví dụ `Vietcombank`, `MBBank`), KHÔNG phải short code hay BIN.
 * Hàm này tự tra `bankCode` → `bank.name` qua BANKS list.
 *
 * `template` là "compact" | "compact2" | "qr_only" | "print". Mặc định "compact".
 * `showInfo` = true để card QR hiển thị thông tin STK/chủ TK bên cạnh.
 */
export function buildVietQrUrl(opts: {
  acc: string;
  bankCode: string;
  amount?: number;
  des?: string;
  template?: string;
  holder?: string;
  store?: string;
  showInfo?: boolean;
}) {
  const bank = findBank(opts.bankCode);
  const bankParam = bank?.name || opts.bankCode;
  const qs = new URLSearchParams();
  qs.set('acc', opts.acc);
  qs.set('bank', bankParam);
  if (opts.amount) qs.set('amount', String(opts.amount));
  if (opts.des) qs.set('des', opts.des);
  if (opts.template) qs.set('template', opts.template);
  if (opts.holder) qs.set('holder', opts.holder);
  if (opts.store) qs.set('store', opts.store);
  if (opts.showInfo !== false) qs.set('showinfo', 'true');
  return `https://vietqr.app/img?${qs.toString()}`;
}
