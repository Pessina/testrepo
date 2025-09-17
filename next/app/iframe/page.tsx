"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function IframePage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-neutral-50 to-neutral-100 dark:from-neutral-950 dark:to-neutral-900 p-8 flex items-center justify-center">
      <Card className="w-fit shadow-2xl">
        <CardHeader>
          <CardTitle className="text-2xl text-center">Staking Interface</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg blur opacity-20 group-hover:opacity-30 transition duration-300"></div>
            <iframe 
              src="http://localhost:3000/sol/stake?logo=https%3A%2F%2Fpicsum.photos%2F200%2F300&primary=%23168F9C&bg=%23c2c2c2&text=%23000000"
              width="600" 
              height="900" 
              className="relative rounded-lg"
              title="Staking Interface"
              style={{ border: 0 }}
            />
          </div>
        </CardContent>
      </Card>
    </main>
  );
}