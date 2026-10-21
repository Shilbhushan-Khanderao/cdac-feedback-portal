import { Document, Image, Page, Path, StyleSheet, Svg, Text, View } from '@react-pdf/renderer';
import { CDAC_MARK_PATH, CDAC_MARK_VIEWBOX } from '../lib/brandMark';

// Ported from v1 ReportDocument.jsx: title block, 2 chart images per page, one page per comment section.
// No emoji source: it would fetch from a CDN (breaks air-gapped hosts), so emoji are stripped from text instead.

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 11, fontFamily: 'Helvetica' },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  brandDivider: { width: 1, height: 18, backgroundColor: '#d6d3d1', marginHorizontal: 10 },
  brandText: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#166e40' },
  title: { fontSize: 16, textAlign: 'center', marginBottom: 10, fontFamily: 'Helvetica-Bold' },
  hr: { borderBottomWidth: 1, borderBottomColor: '#cccccc', marginVertical: 6 },
  meta: { marginBottom: 4 },
  chart: { width: '100%', height: 300, objectFit: 'contain', marginBottom: 12 },
  commentHeader: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#cccccc',
  },
  row: { flexDirection: 'row', marginBottom: 3, marginLeft: 6 },
  bullet: { width: 14, fontSize: 10 },
  comment: { flex: 1, fontSize: 10 },
});

// Strip control characters that corrupt the PDF stream (v1 sanitizePdfText).
const clean = (t: string) =>
  t
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/[\p{Extended_Pictographic}\u200D\uFE0F\u{1F3FB}-\u{1F3FF}\u{1F1E6}-\u{1F1FF}]/gu, '')
    .trim();

export type ReportProps = {
  title: string;
  meta: [string, string][];
  chartImages: string[];
  comments: { title: string; items: string[] }[];
};

export function ReportDocument({ title, meta, chartImages, comments }: ReportProps) {
  const pairs: string[][] = [];
  for (let i = 0; i < chartImages.length; i += 2) pairs.push(chartImages.slice(i, i + 2));

  return (
    <Document title={title}>
      {(pairs.length ? pairs : [[]]).map((pair, pi) => (
        <Page key={`c${pi}`} size="A4" style={styles.page}>
          {pi === 0 && (
            <View style={{ marginBottom: 6 }}>
              <View style={styles.brandRow}>
                <Svg viewBox={CDAC_MARK_VIEWBOX} style={{ width: 66, height: 47 }}>
                  <Path d={CDAC_MARK_PATH} fill="#166e40" fillRule="evenodd" />
                </Svg>
                <View style={styles.brandDivider} />
                <Text style={styles.brandText}>Feedback Portal</Text>
              </View>
              <Text style={styles.title}>{clean(title)}</Text>
              <View style={styles.hr} />
              {meta.map(([k, v]) => (
                <Text key={k} style={styles.meta}>
                  {k}: {clean(v)}
                </Text>
              ))}
              <View style={styles.hr} />
            </View>
          )}
          {pair.map((src, j) => (
            <Image key={j} style={styles.chart} src={src} />
          ))}
        </Page>
      ))}
      {comments.map((c) => (
        <Page key={c.title} size="A4" style={styles.page}>
          <Text style={styles.commentHeader}>{clean(c.title)}</Text>
          {c.items.length === 0 && <Text style={styles.comment}>No comments recorded for this section.</Text>}
          {c.items.map((item, i) => (
            <View key={i} style={styles.row} wrap={false}>
              <Text style={styles.bullet}>{'•'}</Text>
              <Text style={styles.comment}>{clean(item)}</Text>
            </View>
          ))}
        </Page>
      ))}
    </Document>
  );
}
