// src/app/app/page.tsx  (SERVER)
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

import AppHeader from "@/components/AppHeader";
import SignInCard from "@/components/SignInCard";
import FamilyToolsServer from "../family-tools/FamilyToolsServer";


export default async function AppHome() {
  const session = await getServerSession(authOptions);

  return (
    <div className="max-w-6xl mx-auto px-2 sm:px-6 py-4 sm:py-6 space-y-6">
      <AppHeader />
      {!session ? <SignInCard /> : <FamilyToolsServer />}
    </div>
  );
}
