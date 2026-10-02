import { Document, Font, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

// Ported from v1 ReportDocument.jsx: title block, 2 chart images per page, one page per comment section.
Font.registerEmojiSource({ format: 'png', url: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/' });

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 11, fontFamily: 'Helvetica' },
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
const clean = (t: string) => t.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();

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
