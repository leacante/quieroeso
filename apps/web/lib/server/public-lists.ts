import "server-only";

import { getPrisma } from "@quieroeso/db";
import { getPublicListBySlug, getSharedListByToken } from "@quieroeso/domain";
import { cache } from "react";

/** Memoized per request so metadata, JSON-LD and the page share one query. */
export const loadPublicList = cache((slug: string) => getPublicListBySlug(getPrisma(), slug));

export const loadSharedList = cache((token: string) => getSharedListByToken(getPrisma(), token));
