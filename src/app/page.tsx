import { redirect } from "next/navigation";

// CongressHub demo: the main link opens the admin control panel (demo sign-in first).
// The public side (home, application form, status check) starts at /welcome.
export default function Home() {
  redirect("/admin");
}
