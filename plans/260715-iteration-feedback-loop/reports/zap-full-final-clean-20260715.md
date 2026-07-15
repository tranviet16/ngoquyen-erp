# ZAP Scanning Report

ZAP by [Checkmarx](https://checkmarx.com/).


## Summary of Alerts

| Risk Level | Number of Alerts |
| --- | --- |
| High | 0 |
| Medium | 1 |
| Low | 5 |
| Informational | 5 |




## Insights

| Level | Reason | Site | Description | Statistic |
| --- | --- | --- | --- | --- |
| Low | Warning |  | ZAP warnings logged - see the zap.log file for details | 4    |
| Low | Exceeded Low |  | Percentage of network failures | 5 % |
| Info | Informational | https://admin-pc.tail8998df.ts.net | Percentage of responses with status code 2xx | 49 % |
| Info | Informational | https://admin-pc.tail8998df.ts.net | Percentage of responses with status code 3xx | 5 % |
| Info | Exceeded Low | https://admin-pc.tail8998df.ts.net | Percentage of responses with status code 4xx | 41 % |
| Info | Informational | https://admin-pc.tail8998df.ts.net | Percentage of responses with status code 5xx | 3 % |
| Info | Informational | https://admin-pc.tail8998df.ts.net | Percentage of endpoints with content type application/javascript | 45 % |
| Info | Informational | https://admin-pc.tail8998df.ts.net | Percentage of endpoints with content type font/woff2 | 28 % |
| Info | Informational | https://admin-pc.tail8998df.ts.net | Percentage of endpoints with content type image/x-icon | 2 % |
| Info | Informational | https://admin-pc.tail8998df.ts.net | Percentage of endpoints with content type text/css | 5 % |
| Info | Informational | https://admin-pc.tail8998df.ts.net | Percentage of endpoints with content type text/html | 17 % |
| Info | Informational | https://admin-pc.tail8998df.ts.net | Percentage of endpoints with method GET | 100 % |
| Info | Informational | https://admin-pc.tail8998df.ts.net | Count of total endpoints | 35    |
| Info | Exceeded Low | https://admin-pc.tail8998df.ts.net | Percentage of slow responses | 11 % |
| Info | Informational | https://admin-pc.tail8998df.ts.net:8444 | Percentage of responses with status code 2xx | 96 % |
| Info | Informational | https://admin-pc.tail8998df.ts.net:8444 | Percentage of responses with status code 3xx | 1 % |
| Info | Informational | https://admin-pc.tail8998df.ts.net:8444 | Percentage of responses with status code 4xx | 1 % |
| Info | Informational | https://admin-pc.tail8998df.ts.net:8444 | Percentage of endpoints with content type image/x-icon | 14 % |
| Info | Informational | https://admin-pc.tail8998df.ts.net:8444 | Percentage of endpoints with content type text/css | 14 % |
| Info | Informational | https://admin-pc.tail8998df.ts.net:8444 | Percentage of endpoints with content type text/html | 42 % |
| Info | Informational | https://admin-pc.tail8998df.ts.net:8444 | Percentage of endpoints with content type text/javascript | 28 % |
| Info | Informational | https://admin-pc.tail8998df.ts.net:8444 | Percentage of endpoints with method GET | 100 % |
| Info | Informational | https://admin-pc.tail8998df.ts.net:8444 | Count of total endpoints | 7    |
| Info | Informational | https://admin-pc.tail8998df.ts.net:8444 | Percentage of slow responses | 6 % |







## Alerts

| Name | Risk Level | Number of Instances |
| --- | --- | --- |
| CSP: Failure to Define Directive with No Fallback | Medium | 3 |
| Cross-Origin-Embedder-Policy Header Missing or Invalid | Low | 1 |
| Cross-Origin-Resource-Policy Header Missing or Invalid | Low | 5 |
| Permissions Policy Header Not Set | Low | 4 |
| Strict-Transport-Security Header Not Set | Low | Systemic |
| X-Content-Type-Options Header Missing | Low | 4 |
| Modern Web Application | Informational | 4 |
| Non-Storable Content | Informational | 5 |
| Re-examine Cache-control Directives | Informational | 1 |
| Storable and Cacheable Content | Informational | Systemic |
| User Agent Fuzzer | Informational | Systemic |




## Alert Detail



### [ CSP: Failure to Define Directive with No Fallback ](https://www.zaproxy.org/docs/alerts/10055/)



##### Medium (High)

### Description

The Content Security Policy fails to define one of the directives that has no fallback. Missing/excluding them is the same as allowing anything.

* URL: https://admin-pc.tail8998df.ts.net:8444/
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444/`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self' 'nonce-7INWYfH425ncuSC8Gh51uQ'; style-src 'self' 'nonce-7INWYfH425ncuSC8Gh51uQ'; font-src 'self' data:; connect-src 'self' https://*.glitchtip.com; script-src 'self' https://*.glitchtip.com 'sha256-iRcDQ27XiXX4k+jbJ8nGeQFBnBOjmII7FdMlixb6QE4=' 'nonce-7INWYfH425ncuSC8Gh51uQ'; img-src 'self'; frame-src 'self'`
  * Other Info: `The directive(s): frame-ancestors, form-action is/are among the directives that do not fallback to default-src.`
* URL: https://admin-pc.tail8998df.ts.net:8444/1
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444/1`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self'; style-src 'self'; font-src 'self' data:; connect-src 'self' https://*.glitchtip.com; script-src 'self' https://*.glitchtip.com 'sha256-iRcDQ27XiXX4k+jbJ8nGeQFBnBOjmII7FdMlixb6QE4='; img-src 'self'; frame-src 'self'`
  * Other Info: `The directive(s): frame-ancestors, form-action is/are among the directives that do not fallback to default-src.`
* URL: https://admin-pc.tail8998df.ts.net:8444/favicon.ico
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444/favicon.ico`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self'; style-src 'self'; font-src 'self' data:; connect-src 'self' https://*.glitchtip.com; script-src 'self' https://*.glitchtip.com 'sha256-iRcDQ27XiXX4k+jbJ8nGeQFBnBOjmII7FdMlixb6QE4='; img-src 'self'; frame-src 'self'`
  * Other Info: `The directive(s): frame-ancestors, form-action is/are among the directives that do not fallback to default-src.`


Instances: 3

### Solution

Ensure that your web server, application server, load balancer, etc. is properly configured to set the Content-Security-Policy header.

### Reference


* [ https://www.w3.org/TR/CSP/ ](https://www.w3.org/TR/CSP/)
* [ https://caniuse.com/#search=content+security+policy ](https://caniuse.com/#search=content+security+policy)
* [ https://content-security-policy.com/ ](https://content-security-policy.com/)
* [ https://github.com/HtmlUnit/htmlunit-csp ](https://github.com/HtmlUnit/htmlunit-csp)
* [ https://web.dev/articles/csp#resource-options ](https://web.dev/articles/csp#resource-options)


#### CWE Id: [ 693 ](https://cwe.mitre.org/data/definitions/693.html)


#### WASC Id: 15

#### Source ID: 3

### [ Cross-Origin-Embedder-Policy Header Missing or Invalid ](https://www.zaproxy.org/docs/alerts/90004/)



##### Low (Medium)

### Description

Cross-Origin-Embedder-Policy header is a response header that prevents a document from loading any cross-origin resources that don't explicitly grant the document permission (using CORP or CORS).

* URL: https://admin-pc.tail8998df.ts.net:8444/
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444/`
  * Method: `GET`
  * Parameter: `Cross-Origin-Embedder-Policy`
  * Attack: ``
  * Evidence: ``
  * Other Info: ``


Instances: 1

### Solution

Ensure that the application/web server sets the Cross-Origin-Embedder-Policy header appropriately, and that it sets the Cross-Origin-Embedder-Policy header to 'require-corp' for documents.
If possible, ensure that the end user uses a standards-compliant and modern web browser that supports the Cross-Origin-Embedder-Policy header (https://caniuse.com/mdn-http_headers_cross-origin-embedder-policy).

### Reference


* [ https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy ](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy)


#### CWE Id: [ 693 ](https://cwe.mitre.org/data/definitions/693.html)


#### WASC Id: 14

#### Source ID: 3

### [ Cross-Origin-Resource-Policy Header Missing or Invalid ](https://www.zaproxy.org/docs/alerts/90004/)



##### Low (Medium)

### Description

Cross-Origin-Resource-Policy header is an opt-in header designed to counter side-channels attacks like Spectre. Resource should be specifically set as shareable amongst different origins.

* URL: https://admin-pc.tail8998df.ts.net:8444/
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444/`
  * Method: `GET`
  * Parameter: `Cross-Origin-Resource-Policy`
  * Attack: ``
  * Evidence: ``
  * Other Info: ``
* URL: https://admin-pc.tail8998df.ts.net:8444/static/favicon.ico
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444/static/favicon.ico`
  * Method: `GET`
  * Parameter: `Cross-Origin-Resource-Policy`
  * Attack: ``
  * Evidence: ``
  * Other Info: ``
* URL: https://admin-pc.tail8998df.ts.net:8444/static/main-XN4MMUMM.js
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444/static/main-XN4MMUMM.js`
  * Method: `GET`
  * Parameter: `Cross-Origin-Resource-Policy`
  * Attack: ``
  * Evidence: ``
  * Other Info: ``
* URL: https://admin-pc.tail8998df.ts.net:8444/static/polyfills-HQS6ET2M.js
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444/static/polyfills-HQS6ET2M.js`
  * Method: `GET`
  * Parameter: `Cross-Origin-Resource-Policy`
  * Attack: ``
  * Evidence: ``
  * Other Info: ``
* URL: https://admin-pc.tail8998df.ts.net:8444/static/styles-UU4ALEEH.css
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444/static/styles-UU4ALEEH.css`
  * Method: `GET`
  * Parameter: `Cross-Origin-Resource-Policy`
  * Attack: ``
  * Evidence: ``
  * Other Info: ``


Instances: 5

### Solution

Ensure that the application/web server sets the Cross-Origin-Resource-Policy header appropriately, and that it sets the Cross-Origin-Resource-Policy header to 'same-origin' for all web pages.
'same-site' is considered as less secured and should be avoided.
If resources must be shared, set the header to 'cross-origin'.
If possible, ensure that the end user uses a standards-compliant and modern web browser that supports the Cross-Origin-Resource-Policy header (https://caniuse.com/mdn-http_headers_cross-origin-resource-policy).

### Reference


* [ https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy ](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy)


#### CWE Id: [ 693 ](https://cwe.mitre.org/data/definitions/693.html)


#### WASC Id: 14

#### Source ID: 3

### [ Permissions Policy Header Not Set ](https://www.zaproxy.org/docs/alerts/10063/)



##### Low (Medium)

### Description

Permissions Policy Header is an added layer of security that helps to restrict from unauthorized access or usage of browser/client features by web resources. This policy ensures the user privacy by limiting or specifying the features of the browsers can be used by the web resources. Permissions Policy provides a set of standard HTTP headers that allow website owners to limit which features of browsers can be used by the page such as camera, microphone, location, full screen etc.

* URL: https://admin-pc.tail8998df.ts.net:8444/
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444/`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: ``
  * Other Info: ``
* URL: https://admin-pc.tail8998df.ts.net:8444/1
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444/1`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: ``
  * Other Info: ``
* URL: https://admin-pc.tail8998df.ts.net:8444/static/main-XN4MMUMM.js
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444/static/main-XN4MMUMM.js`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: ``
  * Other Info: ``
* URL: https://admin-pc.tail8998df.ts.net:8444/static/polyfills-HQS6ET2M.js
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444/static/polyfills-HQS6ET2M.js`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: ``
  * Other Info: ``


Instances: 4

### Solution

Ensure that your web server, application server, load balancer, etc. is configured to set the Permissions-Policy header.

### Reference


* [ https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy ](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy)
* [ https://developer.chrome.com/blog/feature-policy/ ](https://developer.chrome.com/blog/feature-policy/)
* [ https://scotthelme.co.uk/a-new-security-header-feature-policy/ ](https://scotthelme.co.uk/a-new-security-header-feature-policy/)
* [ https://w3c.github.io/webappsec-feature-policy/ ](https://w3c.github.io/webappsec-feature-policy/)
* [ https://www.smashingmagazine.com/2018/12/feature-policy/ ](https://www.smashingmagazine.com/2018/12/feature-policy/)


#### CWE Id: [ 693 ](https://cwe.mitre.org/data/definitions/693.html)


#### WASC Id: 15

#### Source ID: 3

### [ Strict-Transport-Security Header Not Set ](https://www.zaproxy.org/docs/alerts/10035/)



##### Low (High)

### Description

HTTP Strict Transport Security (HSTS) is a web security policy mechanism whereby a web server declares that complying user agents (such as a web browser) are to interact with it using only secure HTTPS connections (i.e. HTTP layered over TLS/SSL). HSTS is an IETF standards track protocol and is specified in RFC 6797.

* URL: https://admin-pc.tail8998df.ts.net:8444/
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444/`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: ``
  * Other Info: ``
* URL: https://admin-pc.tail8998df.ts.net:8444/1
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444/1`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: ``
  * Other Info: ``
* URL: https://admin-pc.tail8998df.ts.net:8444/static/favicon.ico
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444/static/favicon.ico`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: ``
  * Other Info: ``
* URL: https://admin-pc.tail8998df.ts.net:8444/static/main-XN4MMUMM.js
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444/static/main-XN4MMUMM.js`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: ``
  * Other Info: ``
* URL: https://admin-pc.tail8998df.ts.net:8444/static/styles-UU4ALEEH.css
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444/static/styles-UU4ALEEH.css`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: ``
  * Other Info: ``

Instances: Systemic


### Solution

Ensure that your web server, application server, load balancer, etc. is configured to enforce Strict-Transport-Security.

### Reference


* [ https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Strict_Transport_Security_Cheat_Sheet.html ](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Strict_Transport_Security_Cheat_Sheet.html)
* [ https://owasp.org/www-community/Security_Headers ](https://owasp.org/www-community/Security_Headers)
* [ https://en.wikipedia.org/wiki/HTTP_Strict_Transport_Security ](https://en.wikipedia.org/wiki/HTTP_Strict_Transport_Security)
* [ https://caniuse.com/stricttransportsecurity ](https://caniuse.com/stricttransportsecurity)
* [ https://datatracker.ietf.org/doc/html/rfc6797 ](https://datatracker.ietf.org/doc/html/rfc6797)


#### CWE Id: [ 319 ](https://cwe.mitre.org/data/definitions/319.html)


#### WASC Id: 15

#### Source ID: 3

### [ X-Content-Type-Options Header Missing ](https://www.zaproxy.org/docs/alerts/10021/)



##### Low (Medium)

### Description

The Anti-MIME-Sniffing header X-Content-Type-Options was not set to 'nosniff'. This allows older versions of Internet Explorer and Chrome to perform MIME-sniffing on the response body, potentially causing the response body to be interpreted and displayed as a content type other than the declared content type. Current (early 2014) and legacy versions of Firefox will use the declared content type (if one is set), rather than performing MIME-sniffing.

* URL: https://admin-pc.tail8998df.ts.net:8444/static/favicon.ico
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444/static/favicon.ico`
  * Method: `GET`
  * Parameter: `x-content-type-options`
  * Attack: ``
  * Evidence: ``
  * Other Info: `This issue still applies to error type pages (401, 403, 500, etc.) as those pages are often still affected by injection issues, in which case there is still concern for browsers sniffing pages away from their actual content type.
At "High" threshold this scan rule will not alert on client or server error responses.`
* URL: https://admin-pc.tail8998df.ts.net:8444/static/main-XN4MMUMM.js
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444/static/main-XN4MMUMM.js`
  * Method: `GET`
  * Parameter: `x-content-type-options`
  * Attack: ``
  * Evidence: ``
  * Other Info: `This issue still applies to error type pages (401, 403, 500, etc.) as those pages are often still affected by injection issues, in which case there is still concern for browsers sniffing pages away from their actual content type.
At "High" threshold this scan rule will not alert on client or server error responses.`
* URL: https://admin-pc.tail8998df.ts.net:8444/static/polyfills-HQS6ET2M.js
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444/static/polyfills-HQS6ET2M.js`
  * Method: `GET`
  * Parameter: `x-content-type-options`
  * Attack: ``
  * Evidence: ``
  * Other Info: `This issue still applies to error type pages (401, 403, 500, etc.) as those pages are often still affected by injection issues, in which case there is still concern for browsers sniffing pages away from their actual content type.
At "High" threshold this scan rule will not alert on client or server error responses.`
* URL: https://admin-pc.tail8998df.ts.net:8444/static/styles-UU4ALEEH.css
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444/static/styles-UU4ALEEH.css`
  * Method: `GET`
  * Parameter: `x-content-type-options`
  * Attack: ``
  * Evidence: ``
  * Other Info: `This issue still applies to error type pages (401, 403, 500, etc.) as those pages are often still affected by injection issues, in which case there is still concern for browsers sniffing pages away from their actual content type.
At "High" threshold this scan rule will not alert on client or server error responses.`


Instances: 4

### Solution

Ensure that the application/web server sets the Content-Type header appropriately, and that it sets the X-Content-Type-Options header to 'nosniff' for all web pages.
If possible, ensure that the end user uses a standards-compliant and modern web browser that does not perform MIME-sniffing at all, or that can be directed by the web application/web server to not perform MIME-sniffing.

### Reference


* [ https://learn.microsoft.com/en-us/previous-versions/windows/internet-explorer/ie-developer/compatibility/gg622941(v=vs.85) ](https://learn.microsoft.com/en-us/previous-versions/windows/internet-explorer/ie-developer/compatibility/gg622941(v=vs.85))
* [ https://owasp.org/www-community/Security_Headers ](https://owasp.org/www-community/Security_Headers)


#### CWE Id: [ 693 ](https://cwe.mitre.org/data/definitions/693.html)


#### WASC Id: 15

#### Source ID: 3

### [ Modern Web Application ](https://www.zaproxy.org/docs/alerts/10109/)



##### Informational (Medium)

### Description

The application appears to be a modern web application. If you need to explore it automatically then the Client Spider may well be more effective than the standard one.

* URL: https://admin-pc.tail8998df.ts.net/login%3FcallbackUrl=%252F
  * Node Name: `https://admin-pc.tail8998df.ts.net/login (callbackUrl)`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `<script src="/_next/static/chunks/1fwxhcgd98n4v.js" async="" nonce="MzUxMTk2ODYtYzYwMS00YTM2LWI1N2EtMGNjZDY1YjNjOTli"></script>`
  * Other Info: `No links have been found while there are scripts, which is an indication that this is a modern web application.`
* URL: https://admin-pc.tail8998df.ts.net/login%3FcallbackUrl=%252Frobots.txt
  * Node Name: `https://admin-pc.tail8998df.ts.net/login (callbackUrl)`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `<script src="/_next/static/chunks/1fwxhcgd98n4v.js" async="" nonce="NWQ4ZGViZTEtYTEwYi00MmNhLTgxMTAtZjJkNTZjNTNkZWYy"></script>`
  * Other Info: `No links have been found while there are scripts, which is an indication that this is a modern web application.`
* URL: https://admin-pc.tail8998df.ts.net/login%3FcallbackUrl=%252Fsitemap.xml
  * Node Name: `https://admin-pc.tail8998df.ts.net/login (callbackUrl)`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `<script src="/_next/static/chunks/1fwxhcgd98n4v.js" async="" nonce="OTI4YzVhOWUtMzUwOC00NmU2LTk2ZjgtMDNlZGVmMDhjNDA1"></script>`
  * Other Info: `No links have been found while there are scripts, which is an indication that this is a modern web application.`
* URL: https://admin-pc.tail8998df.ts.net:8444/
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444/`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `<script nonce="7INWYfH425ncuSC8Gh51uQ">
      const theme = localStorage.getItem("theme");
      const systemTheme = matchMedia("(prefers-color-scheme: dark)");
      if (theme === "dark" || (theme === null && systemTheme.matches)) {
        document.documentElement.classList.remove("light");
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
        document.documentElement.classList.add("light");
      }
    </script>`
  * Other Info: `No links have been found while there are scripts, which is an indication that this is a modern web application.`


Instances: 4

### Solution

This is an informational alert and so no changes are required.

### Reference




#### Source ID: 3

### [ Non-Storable Content ](https://www.zaproxy.org/docs/alerts/10049/)



##### Informational (Medium)

### Description

The response contents are not storable by caching components such as proxy servers. If the response does not contain sensitive, personal or user-specific information, it may benefit from being stored and cached, to improve performance.

* URL: https://admin-pc.tail8998df.ts.net
  * Node Name: `https://admin-pc.tail8998df.ts.net`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `307`
  * Other Info: ``
* URL: https://admin-pc.tail8998df.ts.net/
  * Node Name: `https://admin-pc.tail8998df.ts.net/`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `307`
  * Other Info: ``
* URL: https://admin-pc.tail8998df.ts.net/login%3FcallbackUrl=%252F
  * Node Name: `https://admin-pc.tail8998df.ts.net/login (callbackUrl)`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `no-store`
  * Other Info: ``
* URL: https://admin-pc.tail8998df.ts.net/robots.txt
  * Node Name: `https://admin-pc.tail8998df.ts.net/robots.txt`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `307`
  * Other Info: ``
* URL: https://admin-pc.tail8998df.ts.net/sitemap.xml
  * Node Name: `https://admin-pc.tail8998df.ts.net/sitemap.xml`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `307`
  * Other Info: ``


Instances: 5

### Solution

The content may be marked as storable by ensuring that the following conditions are satisfied:
The request method must be understood by the cache and defined as being cacheable ("GET", "HEAD", and "POST" are currently defined as cacheable)
The response status code must be understood by the cache (one of the 1XX, 2XX, 3XX, 4XX, or 5XX response classes are generally understood)
The "no-store" cache directive must not appear in the request or response header fields
For caching by "shared" caches such as "proxy" caches, the "private" response directive must not appear in the response
For caching by "shared" caches such as "proxy" caches, the "Authorization" header field must not appear in the request, unless the response explicitly allows it (using one of the "must-revalidate", "public", or "s-maxage" Cache-Control response directives)
In addition to the conditions above, at least one of the following conditions must also be satisfied by the response:
It must contain an "Expires" header field
It must contain a "max-age" response directive
For "shared" caches such as "proxy" caches, it must contain a "s-maxage" response directive
It must contain a "Cache Control Extension" that allows it to be cached
It must have a status code that is defined as cacheable by default (200, 203, 204, 206, 300, 301, 404, 405, 410, 414, 501).

### Reference


* [ https://datatracker.ietf.org/doc/html/rfc7234 ](https://datatracker.ietf.org/doc/html/rfc7234)
* [ https://datatracker.ietf.org/doc/html/rfc7231 ](https://datatracker.ietf.org/doc/html/rfc7231)
* [ https://www.w3.org/Protocols/rfc2616/rfc2616-sec13.html ](https://www.w3.org/Protocols/rfc2616/rfc2616-sec13.html)


#### CWE Id: [ 524 ](https://cwe.mitre.org/data/definitions/524.html)


#### WASC Id: 13

#### Source ID: 3

### [ Re-examine Cache-control Directives ](https://www.zaproxy.org/docs/alerts/10015/)



##### Informational (Low)

### Description

The cache-control header has not been set properly or is missing, allowing the browser and proxies to cache content. For static assets like css, js, or image files this might be intended, however, the resources should be reviewed to ensure that no sensitive content will be cached.

* URL: https://admin-pc.tail8998df.ts.net:8444/
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444/`
  * Method: `GET`
  * Parameter: `cache-control`
  * Attack: ``
  * Evidence: ``
  * Other Info: ``


Instances: 1

### Solution

For secure content, ensure the cache-control HTTP header is set with "no-cache, no-store, must-revalidate". If an asset should be cached consider setting the directives "public, max-age, immutable".

### Reference


* [ https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html#web-content-caching ](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html#web-content-caching)
* [ https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control ](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control)
* [ https://grayduck.mn/2021/09/13/cache-control-recommendations/ ](https://grayduck.mn/2021/09/13/cache-control-recommendations/)


#### CWE Id: [ 525 ](https://cwe.mitre.org/data/definitions/525.html)


#### WASC Id: 13

#### Source ID: 3

### [ Storable and Cacheable Content ](https://www.zaproxy.org/docs/alerts/10049/)



##### Informational (Medium)

### Description

The response contents are storable by caching components such as proxy servers, and may be retrieved directly from the cache, rather than from the origin server by the caching servers, in response to similar requests from other users. If the response data is sensitive, personal or user-specific, this may result in sensitive information being leaked. In some cases, this may even result in a user gaining complete control of the session of another user, depending on the configuration of the caching components in use in their environment. This is primarily an issue where "shared" caching servers such as "proxy" caches are configured on the local network. This configuration is typically found in corporate or educational environments, for instance.

* URL: https://admin-pc.tail8998df.ts.net/_next/static/media/53e45098eac42afb-s.p.1uklb5el4zgvl.woff2
  * Node Name: `https://admin-pc.tail8998df.ts.net/_next/static/media/53e45098eac42afb-s.p.1uklb5el4zgvl.woff2`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `max-age=31536000`
  * Other Info: ``
* URL: https://admin-pc.tail8998df.ts.net/_next/static/media/625a092f804baad3-s.p.1zvg0ggiaivzo.woff2
  * Node Name: `https://admin-pc.tail8998df.ts.net/_next/static/media/625a092f804baad3-s.p.1zvg0ggiaivzo.woff2`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `max-age=31536000`
  * Other Info: ``
* URL: https://admin-pc.tail8998df.ts.net/_next/static/media/6f42e0a3b0519c4d-s.p.13y-iz2lazqtb.woff2
  * Node Name: `https://admin-pc.tail8998df.ts.net/_next/static/media/6f42e0a3b0519c4d-s.p.13y-iz2lazqtb.woff2`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `max-age=31536000`
  * Other Info: ``
* URL: https://admin-pc.tail8998df.ts.net/_next/static/media/8f46d218c8f79e34-s.p.2wu4yy186g04j.woff2
  * Node Name: `https://admin-pc.tail8998df.ts.net/_next/static/media/8f46d218c8f79e34-s.p.2wu4yy186g04j.woff2`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `max-age=31536000`
  * Other Info: ``
* URL: https://admin-pc.tail8998df.ts.net/_next/static/media/dc6d2a64e9dbf3bc-s.p.3mjzw95c0-_52.woff2
  * Node Name: `https://admin-pc.tail8998df.ts.net/_next/static/media/dc6d2a64e9dbf3bc-s.p.3mjzw95c0-_52.woff2`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `max-age=31536000`
  * Other Info: ``

Instances: Systemic


### Solution

Validate that the response does not contain sensitive, personal or user-specific information. If it does, consider the use of the following HTTP response headers, to limit, or prevent the content being stored and retrieved from the cache by another user:
Cache-Control: no-cache, no-store, must-revalidate, private
Pragma: no-cache
Expires: 0
This configuration directs both HTTP 1.0 and HTTP 1.1 compliant caching servers to not store the response, and to not retrieve the response (without validation) from the cache, in response to a similar request.

### Reference


* [ https://datatracker.ietf.org/doc/html/rfc7234 ](https://datatracker.ietf.org/doc/html/rfc7234)
* [ https://datatracker.ietf.org/doc/html/rfc7231 ](https://datatracker.ietf.org/doc/html/rfc7231)
* [ https://www.w3.org/Protocols/rfc2616/rfc2616-sec13.html ](https://www.w3.org/Protocols/rfc2616/rfc2616-sec13.html)


#### CWE Id: [ 524 ](https://cwe.mitre.org/data/definitions/524.html)


#### WASC Id: 13

#### Source ID: 3

### [ User Agent Fuzzer ](https://www.zaproxy.org/docs/alerts/10104/)



##### Informational (Medium)

### Description

Check for differences in response based on fuzzed User Agent (eg. mobile sites, access as a Search Engine Crawler). Compares the response statuscode and the hashcode of the response body with the original response.

* URL: https://admin-pc.tail8998df.ts.net
  * Node Name: `https://admin-pc.tail8998df.ts.net`
  * Method: `GET`
  * Parameter: `Header User-Agent`
  * Attack: `Mozilla/4.0 (compatible; MSIE 8.0; Windows NT 6.1)`
  * Evidence: ``
  * Other Info: ``
* URL: https://admin-pc.tail8998df.ts.net/
  * Node Name: `https://admin-pc.tail8998df.ts.net/`
  * Method: `GET`
  * Parameter: `Header User-Agent`
  * Attack: `Mozilla/4.0 (compatible; MSIE 8.0; Windows NT 6.1)`
  * Evidence: ``
  * Other Info: ``
* URL: https://admin-pc.tail8998df.ts.net/_next
  * Node Name: `https://admin-pc.tail8998df.ts.net/_next`
  * Method: `GET`
  * Parameter: `Header User-Agent`
  * Attack: `Mozilla/4.0 (compatible; MSIE 7.0; Windows NT 6.0)`
  * Evidence: ``
  * Other Info: ``
* URL: https://admin-pc.tail8998df.ts.net/_next
  * Node Name: `https://admin-pc.tail8998df.ts.net/_next`
  * Method: `GET`
  * Parameter: `Header User-Agent`
  * Attack: `Mozilla/4.0 (compatible; MSIE 8.0; Windows NT 6.1)`
  * Evidence: ``
  * Other Info: ``
* URL: https://admin-pc.tail8998df.ts.net/_next/static
  * Node Name: `https://admin-pc.tail8998df.ts.net/_next/static`
  * Method: `GET`
  * Parameter: `Header User-Agent`
  * Attack: `Mozilla/4.0 (compatible; MSIE 8.0; Windows NT 6.1)`
  * Evidence: ``
  * Other Info: ``

Instances: Systemic


### Solution



### Reference


* [ https://owasp.org/wstg ](https://owasp.org/wstg)



#### Source ID: 1


