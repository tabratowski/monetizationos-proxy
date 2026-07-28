import { env } from 'cloudflare:workers'
import { type ElementHandlers, type HtmlRewriterSession, MOSProxyBuilder } from '@monetizationos/proxy'
import { parse } from "cookie";

export default {
    async fetch(request): Promise<Response> {
        console.log("request: ", request.url)
        const COOKIE_NAME = "wpe_media_paywall";
        const cookie = parse(request.headers.get("Cookie") || request.headers.get("Set-Cookie") || "");
        const paywallCookie = cookie[COOKIE_NAME];
        console.log("Paywall cookie value:", paywallCookie);
        const decodedPaywallCookie = atob(decodeURIComponent(paywallCookie));
        const jsonPaywallCookie = JSON.parse(decodedPaywallCookie);
        console.log("JSON paywall cookie's mosSecretKey:", jsonPaywallCookie.mosSecretKey);
        console.log("JSON paywall cookie's originUrl:", jsonPaywallCookie.originUrl);
        console.log("JSON paywall cookie's surfaceSlug:", jsonPaywallCookie.surfaceSlug);

        const proxy = new MOSProxyBuilder()
            .withConfig({
                originUrl: jsonPaywallCookie.originUrl || 'https://example.local',
                surfaceSlug: jsonPaywallCookie.surfaceSlug ?? '',
                mosHost: env.MONETIZATION_OS_HOST || 'https://api.monetizationos.com',
                mosSecretKey: jsonPaywallCookie.mosSecretKey ?? '',
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

        return await proxy.handle(request);
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
