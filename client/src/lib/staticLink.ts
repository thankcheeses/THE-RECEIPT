/**
 * tRPC link that resolves operations in the browser instead of over HTTP.
 * Used by the GitHub Pages build, where there is no server to call.
 */
import { TRPCClientError, type TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import type { AppRouter } from "../../../server/routers";
import { callStaticProcedure } from "./staticDemo";

export const staticLink = (): TRPCLink<AppRouter> => () => ({ op }) =>
  observable((observer) => {
    let cancelled = false;
    callStaticProcedure(op.path, op.input)
      .then((data) => {
        if (cancelled) return;
        observer.next({ result: { type: "data", data } });
        observer.complete();
      })
      .catch((error) => {
        if (cancelled) return;
        observer.error(TRPCClientError.from(error as Error));
      });
    return () => {
      cancelled = true;
    };
  });
