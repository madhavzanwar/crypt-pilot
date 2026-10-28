import { redirect } from "next/navigation";

export default function Page() {
  redirect("/scenarios?tab=tax");
}
