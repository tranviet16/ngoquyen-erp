# ZAP Scanning Report

ZAP by [Checkmarx](https://checkmarx.com/).


## Summary of Alerts

| Risk Level | Number of Alerts |
| --- | --- |
| High | 0 |
| Medium | 2 |
| Low | 0 |
| Informational | 5 |




## Insights

| Level | Reason | Site | Description | Statistic |
| --- | --- | --- | --- | --- |
| Low | Warning |  | ZAP warnings logged - see the zap.log file for details | 2    |
| Low | Exceeded Low |  | Percentage of network failures | 6 % |
| Info | Informational | https://admin-pc.tail8998df.ts.net | Percentage of responses with status code 2xx | 49 % |
| Info | Informational | https://admin-pc.tail8998df.ts.net | Percentage of responses with status code 3xx | 5 % |
| Info | Exceeded Low | https://admin-pc.tail8998df.ts.net | Percentage of responses with status code 4xx | 41 % |
| Info | Informational | https://admin-pc.tail8998df.ts.net | Percentage of responses with status code 5xx | 3 % |
| Info | Informational | https://admin-pc.tail8998df.ts.net | Percentage of endpoints with content type application/javascript | 47 % |
| Info | Informational | https://admin-pc.tail8998df.ts.net | Percentage of endpoints with content type font/woff2 | 29 % |
| Info | Informational | https://admin-pc.tail8998df.ts.net | Percentage of endpoints with content type image/x-icon | 2 % |
| Info | Informational | https://admin-pc.tail8998df.ts.net | Percentage of endpoints with content type text/css | 5 % |
| Info | Informational | https://admin-pc.tail8998df.ts.net | Percentage of endpoints with content type text/html | 5 % |
| Info | Informational | https://admin-pc.tail8998df.ts.net | Percentage of endpoints with method GET | 100 % |
| Info | Informational | https://admin-pc.tail8998df.ts.net | Count of total endpoints | 34    |
| Info | Exceeded Low | https://admin-pc.tail8998df.ts.net | Percentage of slow responses | 10 % |







## Alerts

| Name | Risk Level | Number of Instances |
| --- | --- | --- |
| CSP: Wildcard Directive | Medium | 4 |
| CSP: style-src unsafe-inline | Medium | 4 |
| Content-Type Header Missing | Informational | 4 |
| Modern Web Application | Informational | 4 |
| Non-Storable Content | Informational | 5 |
| Storable and Cacheable Content | Informational | Systemic |
| User Agent Fuzzer | Informational | Systemic |




## Alert Detail



### [ CSP: Wildcard Directive ](https://www.zaproxy.org/docs/alerts/10055/)



##### Medium (High)

### Description

Content Security Policy (CSP) is an added layer of security that helps to detect and mitigate certain types of attacks. Including (but not limited to) Cross Site Scripting (XSS), and data injection attacks. These attacks are used for everything from data theft to site defacement or distribution of malware. CSP provides a set of standard HTTP headers that allow website owners to declare approved sources of content that browsers should be allowed to load on that page — covered types are JavaScript, CSS, HTML frames, fonts, images and embeddable objects such as Java applets, ActiveX, audio and video files.

* URL: https://admin-pc.tail8998df.ts.net/login%3FcallbackUrl=%252Frobots.txt
  * Node Name: `https://admin-pc.tail8998df.ts.net/login (callbackUrl)`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self'; base-uri 'self'; font-src 'self' data:; form-action 'self'; frame-ancestors 'none'; img-src 'self' data: blob:; object-src 'none'; script-src 'self' 'nonce-MzBiMmM3OGYtZDQ4Yi00ODdlLWFhOGItY2JkYmJiNTIwZDlk' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; connect-src 'self' http://127.0.0.1:8001 ws: wss:; worker-src 'self' blob:; upgrade-insecure-requests`
  * Other Info: `The following directives either allow wildcard sources (or ancestors), are not defined, or are overly broadly defined:
connect-src`
* URL: https://admin-pc.tail8998df.ts.net/login%3FcallbackUrl=%252F
  * Node Name: `https://admin-pc.tail8998df.ts.net/login (callbackUrl)`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self'; base-uri 'self'; font-src 'self' data:; form-action 'self'; frame-ancestors 'none'; img-src 'self' data: blob:; object-src 'none'; script-src 'self' 'nonce-NDNlYTMyODAtMDZjZS00YmM4LThiZTItNzdjNDlhMTc1NWYz' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; connect-src 'self' http://127.0.0.1:8001 ws: wss:; worker-src 'self' blob:; upgrade-insecure-requests`
  * Other Info: `The following directives either allow wildcard sources (or ancestors), are not defined, or are overly broadly defined:
connect-src`
* URL: https://admin-pc.tail8998df.ts.net/login%3FcallbackUrl=%252F
  * Node Name: `https://admin-pc.tail8998df.ts.net/login (callbackUrl)`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self'; base-uri 'self'; font-src 'self' data:; form-action 'self'; frame-ancestors 'none'; img-src 'self' data: blob:; object-src 'none'; script-src 'self' 'nonce-OWM3NWVhM2EtMzNkYi00MTI2LThlNjktYmU0NDZkNDRkMDEy' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; connect-src 'self' http://127.0.0.1:8001 ws: wss:; worker-src 'self' blob:; upgrade-insecure-requests`
  * Other Info: `The following directives either allow wildcard sources (or ancestors), are not defined, or are overly broadly defined:
connect-src`
* URL: https://admin-pc.tail8998df.ts.net/login%3FcallbackUrl=%252Fsitemap.xml
  * Node Name: `https://admin-pc.tail8998df.ts.net/login (callbackUrl)`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self'; base-uri 'self'; font-src 'self' data:; form-action 'self'; frame-ancestors 'none'; img-src 'self' data: blob:; object-src 'none'; script-src 'self' 'nonce-ZDczZjU5NmEtYzYzZC00NDE0LWI0YTctYjAyZDllNTEwODNh' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; connect-src 'self' http://127.0.0.1:8001 ws: wss:; worker-src 'self' blob:; upgrade-insecure-requests`
  * Other Info: `The following directives either allow wildcard sources (or ancestors), are not defined, or are overly broadly defined:
connect-src`


Instances: 4

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

### [ CSP: style-src unsafe-inline ](https://www.zaproxy.org/docs/alerts/10055/)



##### Medium (High)

### Description

Content Security Policy (CSP) is an added layer of security that helps to detect and mitigate certain types of attacks. Including (but not limited to) Cross Site Scripting (XSS), and data injection attacks. These attacks are used for everything from data theft to site defacement or distribution of malware. CSP provides a set of standard HTTP headers that allow website owners to declare approved sources of content that browsers should be allowed to load on that page — covered types are JavaScript, CSS, HTML frames, fonts, images and embeddable objects such as Java applets, ActiveX, audio and video files.

* URL: https://admin-pc.tail8998df.ts.net/login%3FcallbackUrl=%252Frobots.txt
  * Node Name: `https://admin-pc.tail8998df.ts.net/login (callbackUrl)`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self'; base-uri 'self'; font-src 'self' data:; form-action 'self'; frame-ancestors 'none'; img-src 'self' data: blob:; object-src 'none'; script-src 'self' 'nonce-MzBiMmM3OGYtZDQ4Yi00ODdlLWFhOGItY2JkYmJiNTIwZDlk' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; connect-src 'self' http://127.0.0.1:8001 ws: wss:; worker-src 'self' blob:; upgrade-insecure-requests`
  * Other Info: `style-src includes unsafe-inline.`
* URL: https://admin-pc.tail8998df.ts.net/login%3FcallbackUrl=%252F
  * Node Name: `https://admin-pc.tail8998df.ts.net/login (callbackUrl)`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self'; base-uri 'self'; font-src 'self' data:; form-action 'self'; frame-ancestors 'none'; img-src 'self' data: blob:; object-src 'none'; script-src 'self' 'nonce-NDNlYTMyODAtMDZjZS00YmM4LThiZTItNzdjNDlhMTc1NWYz' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; connect-src 'self' http://127.0.0.1:8001 ws: wss:; worker-src 'self' blob:; upgrade-insecure-requests`
  * Other Info: `style-src includes unsafe-inline.`
* URL: https://admin-pc.tail8998df.ts.net/login%3FcallbackUrl=%252F
  * Node Name: `https://admin-pc.tail8998df.ts.net/login (callbackUrl)`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self'; base-uri 'self'; font-src 'self' data:; form-action 'self'; frame-ancestors 'none'; img-src 'self' data: blob:; object-src 'none'; script-src 'self' 'nonce-OWM3NWVhM2EtMzNkYi00MTI2LThlNjktYmU0NDZkNDRkMDEy' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; connect-src 'self' http://127.0.0.1:8001 ws: wss:; worker-src 'self' blob:; upgrade-insecure-requests`
  * Other Info: `style-src includes unsafe-inline.`
* URL: https://admin-pc.tail8998df.ts.net/login%3FcallbackUrl=%252Fsitemap.xml
  * Node Name: `https://admin-pc.tail8998df.ts.net/login (callbackUrl)`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self'; base-uri 'self'; font-src 'self' data:; form-action 'self'; frame-ancestors 'none'; img-src 'self' data: blob:; object-src 'none'; script-src 'self' 'nonce-ZDczZjU5NmEtYzYzZC00NDE0LWI0YTctYjAyZDllNTEwODNh' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; connect-src 'self' http://127.0.0.1:8001 ws: wss:; worker-src 'self' blob:; upgrade-insecure-requests`
  * Other Info: `style-src includes unsafe-inline.`


Instances: 4

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

### [ Content-Type Header Missing ](https://www.zaproxy.org/docs/alerts/10019/)



##### Informational (Medium)

### Description

The Content-Type header was either missing or empty.

* URL: https://admin-pc.tail8998df.ts.net
  * Node Name: `https://admin-pc.tail8998df.ts.net`
  * Method: `GET`
  * Parameter: `content-type`
  * Attack: ``
  * Evidence: ``
  * Other Info: ``
* URL: https://admin-pc.tail8998df.ts.net/
  * Node Name: `https://admin-pc.tail8998df.ts.net/`
  * Method: `GET`
  * Parameter: `content-type`
  * Attack: ``
  * Evidence: ``
  * Other Info: ``
* URL: https://admin-pc.tail8998df.ts.net/robots.txt
  * Node Name: `https://admin-pc.tail8998df.ts.net/robots.txt`
  * Method: `GET`
  * Parameter: `content-type`
  * Attack: ``
  * Evidence: ``
  * Other Info: ``
* URL: https://admin-pc.tail8998df.ts.net/sitemap.xml
  * Node Name: `https://admin-pc.tail8998df.ts.net/sitemap.xml`
  * Method: `GET`
  * Parameter: `content-type`
  * Attack: ``
  * Evidence: ``
  * Other Info: ``


Instances: 4

### Solution

Ensure each page is setting the specific and appropriate content-type value for the content being delivered.

### Reference


* [ https://learn.microsoft.com/en-us/previous-versions/windows/internet-explorer/ie-developer/compatibility/gg622941(v=vs.85) ](https://learn.microsoft.com/en-us/previous-versions/windows/internet-explorer/ie-developer/compatibility/gg622941(v=vs.85))


#### CWE Id: [ 345 ](https://cwe.mitre.org/data/definitions/345.html)


#### WASC Id: 12

#### Source ID: 3

### [ Modern Web Application ](https://www.zaproxy.org/docs/alerts/10109/)



##### Informational (Medium)

### Description

The application appears to be a modern web application. If you need to explore it automatically then the Client Spider may well be more effective than the standard one.

* URL: https://admin-pc.tail8998df.ts.net/login%3FcallbackUrl=%252Frobots.txt
  * Node Name: `https://admin-pc.tail8998df.ts.net/login (callbackUrl)`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `<script src="/_next/static/chunks/1fwxhcgd98n4v.js" async="" nonce="MzBiMmM3OGYtZDQ4Yi00ODdlLWFhOGItY2JkYmJiNTIwZDlk"></script>`
  * Other Info: `No links have been found while there are scripts, which is an indication that this is a modern web application.`
* URL: https://admin-pc.tail8998df.ts.net/login%3FcallbackUrl=%252F
  * Node Name: `https://admin-pc.tail8998df.ts.net/login (callbackUrl)`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `<script src="/_next/static/chunks/1fwxhcgd98n4v.js" async="" nonce="NDNlYTMyODAtMDZjZS00YmM4LThiZTItNzdjNDlhMTc1NWYz"></script>`
  * Other Info: `No links have been found while there are scripts, which is an indication that this is a modern web application.`
* URL: https://admin-pc.tail8998df.ts.net/login%3FcallbackUrl=%252F
  * Node Name: `https://admin-pc.tail8998df.ts.net/login (callbackUrl)`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `<script src="/_next/static/chunks/1fwxhcgd98n4v.js" async="" nonce="OWM3NWVhM2EtMzNkYi00MTI2LThlNjktYmU0NDZkNDRkMDEy"></script>`
  * Other Info: `No links have been found while there are scripts, which is an indication that this is a modern web application.`
* URL: https://admin-pc.tail8998df.ts.net/login%3FcallbackUrl=%252Fsitemap.xml
  * Node Name: `https://admin-pc.tail8998df.ts.net/login (callbackUrl)`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `<script src="/_next/static/chunks/1fwxhcgd98n4v.js" async="" nonce="ZDczZjU5NmEtYzYzZC00NDE0LWI0YTctYjAyZDllNTEwODNh"></script>`
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

### [ Storable and Cacheable Content ](https://www.zaproxy.org/docs/alerts/10049/)



##### Informational (Medium)

### Description

The response contents are storable by caching components such as proxy servers, and may be retrieved directly from the cache, rather than from the origin server by the caching servers, in response to similar requests from other users. If the response data is sensitive, personal or user-specific, this may result in sensitive information being leaked. In some cases, this may even result in a user gaining complete control of the session of another user, depending on the configuration of the caching components in use in their environment. This is primarily an issue where "shared" caching servers such as "proxy" caches are configured on the local network. This configuration is typically found in corporate or educational environments, for instance.

* URL: https://admin-pc.tail8998df.ts.net/_next/static/media/3c285486269019b7-s.p.2g-0we2o5_ngd.woff2
  * Node Name: `https://admin-pc.tail8998df.ts.net/_next/static/media/3c285486269019b7-s.p.2g-0we2o5_ngd.woff2`
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
* URL: https://admin-pc.tail8998df.ts.net/_next/static/media/a3bcb02a0e9e5d11-s.p.25pbmqxk8u2s7.woff2
  * Node Name: `https://admin-pc.tail8998df.ts.net/_next/static/media/a3bcb02a0e9e5d11-s.p.25pbmqxk8u2s7.woff2`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `max-age=31536000`
  * Other Info: ``
* URL: https://admin-pc.tail8998df.ts.net/_next/static/media/a4f4f75ad654963f-s.p.1hvvd1t-trplq.woff2
  * Node Name: `https://admin-pc.tail8998df.ts.net/_next/static/media/a4f4f75ad654963f-s.p.1hvvd1t-trplq.woff2`
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
  * Attack: `Mozilla/4.0 (compatible; MSIE 7.0; Windows NT 6.0)`
  * Evidence: ``
  * Other Info: ``
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
  * Attack: `Mozilla/4.0 (compatible; MSIE 7.0; Windows NT 6.0)`
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
  * Attack: `Mozilla/4.0 (compatible; MSIE 8.0; Windows NT 6.1)`
  * Evidence: ``
  * Other Info: ``

Instances: Systemic


### Solution



### Reference


* [ https://owasp.org/wstg ](https://owasp.org/wstg)



#### Source ID: 1


