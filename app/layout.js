import "./globals.css";

export const metadata = {
  title: "BIT — Website Audit Agent",
  description:
    "micro1 Agentic Workflows Hackathon — Live Website Audit to Personalized Outreach Pitch Generator",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
