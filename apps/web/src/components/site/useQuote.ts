'use client';

import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { useDebounced } from '@/lib/hooks';
import type { QuoteResponse } from './siteTypes';

export interface QuoteInput {
  vehicleId: string;
  purpose: string;
  pickupAt: string;
  returnAt: string;
  pickupAddress?: string;
  dropAddress?: string;
  estimatedKm?: number;
  withDriver: boolean;
  decoration: boolean;
  couponCode?: string;
}

/** Debounced live quote via POST /public/quote. Returns null input → idle. */
export function useQuote(input: QuoteInput | null) {
  const key = input ? JSON.stringify(input) : null;
  const debounced = useDebounced(key, 450);
  const [data, setData] = useState<QuoteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    if (!debounced) {
      setData(null);
      setError(null);
      return;
    }
    const body = JSON.parse(debounced) as QuoteInput;
    const n = ++seq.current;
    setLoading(true);
    setError(null);
    api<QuoteResponse>('/public/quote', {
      body: {
        ...body,
        pickupAddress: body.pickupAddress || undefined,
        dropAddress: body.dropAddress || undefined,
        couponCode: body.couponCode || undefined,
        estimatedKm: body.estimatedKm || undefined,
      },
    })
      .then((r) => n === seq.current && setData(r))
      .catch((e) => {
        if (n === seq.current) {
          setError(errorMessage(e));
          setData(null);
        }
      })
      .finally(() => n === seq.current && setLoading(false));
  }, [debounced]);

  return { data, error, loading: loading || key !== debounced };
}
