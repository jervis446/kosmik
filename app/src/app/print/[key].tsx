import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";

import { PrintView } from "../../components/PrintView";
import { api, ApiError, type ReportPage } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { tr } from "../../lib/i18n";

/** /print/:key — the report laid out for "Save as PDF". */
export default function PrintReport() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const { session, ready } = useAuth();
  const [data, setData] = useState<ReportPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!session) {
      router.replace("/sign-in");
      return;
    }
    api
      .report(key)
      .then((r) => (r.report ? setData(r) : setError(tr("Unlock this report first to download it."))))
      .catch((e) => setError(e instanceof ApiError ? e.message : tr("Something went wrong. Please try again.")));
  }, [ready, session, key]);

  return <PrintView data={data} error={error} backTo={`/reports/${key}`} />;
}
