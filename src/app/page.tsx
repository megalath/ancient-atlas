"use client";

import dynamic from "next/dynamic";

const AtlasApp = dynamic(() => import("@/components/AtlasApp"), {
  ssr: false,
  loading: () => (
    <div className="boot">
      <p className="eyebrow">Ancient Atlas</p>
      <h1>Great Pyramid of Khufu</h1>
      <p>Opening the model.</p>
    </div>
  ),
});

export default function Page() {
  return <AtlasApp />;
}
