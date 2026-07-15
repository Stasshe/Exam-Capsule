"use client";

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background text-foreground">
      <div className="max-w-2xl text-center px-6 py-24">
        <h1 className="text-4xl sm:text-5xl font-bold mb-4">Template</h1>
        <p className="text-lg text-muted-foreground mb-8">A minimal Next.js + Tailwind template</p>

        <div className="flex gap-4 justify-center">
          <a
            href="#"
            className="px-6 py-3 bg-primary text-primary-foreground rounded-md shadow-sm hover:shadow-md"
          >
            Get Started
          </a>
          <a href="#" className="px-6 py-3 border rounded-md text-foreground">
            Learn More
          </a>
        </div>

        <p className="text-sm text-muted-foreground mt-12">Powered by Next.js & Tailwind CSS</p>
      </div>
    </main>
  );
}
