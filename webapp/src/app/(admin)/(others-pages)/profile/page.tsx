import UserAddressCard from "@/components/user-profile/UserAddressCard";
import UserInfoCard from "@/components/user-profile/UserInfoCard";
import UserMetaCard from "@/components/user-profile/UserMetaCard";
import PasswordChangeCard from "@/components/user-profile/PasswordChangeCard";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Perfil | OpenTurn",
  description: "Gerencie suas informações de perfil",
};

export default function Profile() {
  return (
    <div>
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
        <h3 className="mb-5 text-lg font-semibold text-gray-800 dark:text-white/90 lg:mb-7">
          Perfil
        </h3>
        <div className="space-y-6">
          <UserMetaCard />
          <UserInfoCard />
          <UserAddressCard />
          <PasswordChangeCard />
        </div>
      </div>
    </div>
  );
}
