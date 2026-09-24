import "server-only";

import { getLogger } from "@quieroeso/observability";

export const logger = getLogger().child({ app: "web" });
