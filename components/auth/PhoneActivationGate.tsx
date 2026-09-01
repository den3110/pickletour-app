import React from "react";
import { useSelector } from "react-redux";
import { useGetRegistrationSettingsQuery } from "@/slices/settingsApiSlice";
import { useGetMeQuery } from "@/slices/usersApiSlice";
import PhoneActivationModal from "./PhoneActivationModal";

// Khi Admin bật forcePhoneVerification: buộc user đã đăng nhập nhưng chưa kích
// hoạt SĐT phải kích hoạt (hoặc đổi số / đăng xuất) trước khi dùng tiếp.
export default function PhoneActivationGate() {
  const userInfo: any = useSelector((s: any) => s.auth?.userInfo);
  const { data: regSettings } = useGetRegistrationSettingsQuery(undefined);
  const { data: me } = useGetMeQuery(undefined, { skip: !userInfo });

  const force = (regSettings as any)?.forcePhoneVerification === true;
  // Admin buộc RIÊNG tài khoản này (dù toàn hệ thống không bật force).
  const userRequired = (me as any)?.phoneVerificationRequired === true;
  const verified = (me?.phoneVerified ?? userInfo?.phoneVerified) === true;
  const needed = (force || userRequired) && !!userInfo && !verified;

  return <PhoneActivationModal visible={needed} force />;
}
