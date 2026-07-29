import { env } from 'cloudflare:workers'
import { type ElementHandlers, type HtmlRewriterSession, MOSProxyBuilder } from '@monetizationos/proxy'
import { parse } from "cookie";

export default {
    async fetch(request): Promise<Response> {
        const cookies = parse(request.headers.get("X-Forwarded-Cookies") || "");
        const paywallCookie = cookies["wpe_media_paywall"];
        if (!paywallCookie) {
            return new Response("Missing paywall cookie", { status: 400 });
        }

        const decodedPaywallCookie = atob(decodeURIComponent(paywallCookie));
        const jsonPaywallCookie = JSON.parse(decodedPaywallCookie);
        console.log("JSON paywall cookie's mosSecretKey:", jsonPaywallCookie.mosSecretKey);
        console.log("JSON paywall cookie's originUrl:", jsonPaywallCookie.originUrl);
        console.log("JSON paywall cookie's surfaceSlug:", jsonPaywallCookie.surfaceSlug);

        // Set X-Bypass-Snippet to avoid circular calls
        // request.headers.set('X-Bypass-Snippet', 'true'); -> TypeError: Can't modify immutable headers.
        const newHeaders = new Headers(request.headers);
        newHeaders.set('X-Bypass-Snippet', 'true');
        const newRequest = new Request(request, { headers: newHeaders });

        const proxy = new MOSProxyBuilder()
            .withConfig({
                originUrl: jsonPaywallCookie.originUrl,
                surfaceSlug: jsonPaywallCookie.surfaceSlug,
                mosHost: env.MONETIZATION_OS_HOST || 'https://api.monetizationos.com',
                mosSecretKey: jsonPaywallCookie.mosSecretKey,
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

        return await proxy.handle(newRequest);
    },
} satisfies ExportedHandler<Env>

class CloudflareHtmlRewriterSession implements HtmlRewriterSession {
    private readonly rewriter = new HTMLRewriter()

    on(selector: string, handlers: ElementHandlers): HtmlRewriterSession {
        this.rewriter.on(selector, handlers as HTMLRewriterElementContentHandlers)
        return this
    }

    transform(response: Response): Response {
        return this.rewriter.transform(response)
    }
}
