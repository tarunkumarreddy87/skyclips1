import { redirect } from "next/navigation";

/** Demo block route — send users to the real studio shell. */
export default function DashboardPage() {
  redirect("/studio");
}
