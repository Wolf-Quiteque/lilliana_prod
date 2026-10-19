import { Loader } from "@/components/site/Loader";
import { Site } from "@/components/site/Site";
import { getPublishedContent } from "@/lib/server/content";

export default async function Home() {
  const content = await getPublishedContent();
  return (
    <>
      {content.loader.enabled && <Loader loader={content.loader} />}
      <noscript>
        <style>{"#lp-loader{display:none}"}</style>
      </noscript>
      <Site content={content} />
    </>
  );
}
