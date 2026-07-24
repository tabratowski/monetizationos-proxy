import { env } from 'cloudflare:workers'
import { type ElementHandlers, type HtmlRewriterSession, MOSProxyBuilder } from '@monetizationos/proxy'
import { parse } from "cookie";

const proxy = new MOSProxyBuilder()
    .withConfig({
        originUrl: env.ORIGIN_URL || 'https://example.local',
        surfaceSlug: env.SURFACE_SLUG ?? '',
        mosHost: env.MONETIZATION_OS_HOST || 'https://api.monetizationos.com',
        mosSecretKey: env.MONETIZATION_OS_SECRET_KEY ?? '',
        mosEndpointsPrefix: env.MONETIZATION_OS_ENDPOINTS_PREFIX || '/mos-endpoints/',
        anonymousSessionCookieName: env.ANONYMOUS_SESSION_COOKIE_NAME,
        authenticatedUserJwtCookieName: env.AUTHENTICATED_USER_JWT_COOKIE_NAME,
        injectScriptUrl: env.INJECT_SCRIPT_URL || undefined,
        surfaceDecisionsIgnorePaths: env.SURFACE_DECISIONS_IGNORE_PATHS,
        surfaceDecisionsCookies: env.SURFACE_DECISIONS_COOKIES,
        originRequestHeaders: env.ORIGIN_REQUEST_HEADERS ?? {},
    })
    .withOriginFetcher(fetch)
    .withApiFetcher(fetch)
    .withHtmlRewriter({
        capabilities: {
            onEndTag: true,
            nthChild: true,
        },
        create() {
            return new CloudflareHtmlRewriterSession()
        },
    })
    .withClientMetadata({
        build(request) {
            return {
                cloudflare: {
                    cf: request.cf,
                },
            }
        },
    })
    .build()

export default {
    async fetch(request): Promise<Response> {
        const COOKIE_NAME = "wpe_media_paywall";
        console.log("Request cookies:", request.headers.get("Cookie"));

        const response = await proxy.handle(request);
        console.log("Response cookies:", response.headers.get("Set-Cookie"));
        const cookie = parse(response.headers.get("Set-Cookie") || "");
        const paywallCookie = cookie[COOKIE_NAME];
        console.log("Paywall cookie:", paywallCookie);
        return response;
    },
} satisfies ExportedHandler<Env>

class CloudflareHtmlRewriterSession implements HtmlRewriterSession {
    private readonly rewriter = new HTMLRewriter()

    on(selector: string, handlers: ElementHandlers): HtmlRewriterSession {
        console.log("test")
        this.rewriter.on(selector, handlers as HTMLRewriterElementContentHandlers)
        return this
    }

    transform(response: Response): Response {
        return this.rewriter.transform(response)
    }
}
