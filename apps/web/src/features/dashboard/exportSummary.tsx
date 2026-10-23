import { toPng } from 'html-to-image';

/**
 * PDF of the dashboard as filtered: headline numbers, snapshots of the given sections, and up to
 * 15 comments per question. react-pdf is large, so it loads only when a summary is requested.
 */
export async function downloadSummary({
  title,
  meta,
  sections,
  comments,
}: {
  title: string;
  meta: [string, string][];
  sections: (HTMLElement | null)[];
  comments: { title: string; items: string[] }[];
}) {
  const [{ pdf }, { ReportDocument }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('../reports/ReportDocument'),
  ]);
  const chartImages: string[] = [];
  for (const el of sections)
    if (el) chartImages.push(await toPng(el, { pixelRatio: 2, backgroundColor: '#ffffff' }));
  const blob = await pdf(
    <ReportDocument
      title={title}
      meta={meta}
      chartImages={chartImages}
      comments={comments.map((c) => ({ title: c.title, items: c.items.slice(0, 15) }))}
    />,
  ).toBlob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${title.replace(/[^\w-]+/g, '_')}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
