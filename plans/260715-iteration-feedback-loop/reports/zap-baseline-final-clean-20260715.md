# ZAP Scanning Report

ZAP by [Checkmarx](https://checkmarx.com/).


## Summary of Alerts

| Risk Level | Number of Alerts |
| --- | --- |
| High | 0 |
| Medium | 0 |
| Low | 0 |
| Informational | 3 |




## Insights

| Level | Reason | Site | Description | Statistic |
| --- | --- | --- | --- | --- |
| Low | Warning |  | ZAP warnings logged - see the zap.log file for details | 1    |
| Info | Informational | https://admin-pc.tail8998df.ts.net | Percentage of responses with status code 2xx | 86 % |
| Info | Informational | https://admin-pc.tail8998df.ts.net | Percentage of responses with status code 3xx | 13 % |
| Info | Informational | https://admin-pc.tail8998df.ts.net | Percentage of endpoints with content type application/javascript | 48 % |
| Info | Informational | https://admin-pc.tail8998df.ts.net | Percentage of endpoints with content type font/woff2 | 30 % |
| Info | Informational | https://admin-pc.tail8998df.ts.net | Percentage of endpoints with content type image/x-icon | 3 % |
| Info | Informational | https://admin-pc.tail8998df.ts.net | Percentage of endpoints with content type text/css | 6 % |
| Info | Informational | https://admin-pc.tail8998df.ts.net | Percentage of endpoints with content type text/html | 12 % |
| Info | Informational | https://admin-pc.tail8998df.ts.net | Percentage of endpoints with method GET | 100 % |
| Info | Informational | https://admin-pc.tail8998df.ts.net | Count of total endpoints | 33    |
| Info | Informational | https://admin-pc.tail8998df.ts.net | Percentage of slow responses | 36 % |







## Alerts

| Name | Risk Level | Number of Instances |
| --- | --- | --- |
| Modern Web Application | Informational | 4 |
| Non-Storable Content | Informational | 5 |
| Storable and Cacheable Content | Informational | Systemic |




## Alert Detail



### [ Modern Web Application ](https://www.zaproxy.org/docs/alerts/10109/)



##### Informational (Medium)

### Description

The application appears to be a modern web application. If you need to explore it automatically then the Client Spider may well be more effective than the standard one.

* URL: https://admin-pc.tail8998df.ts.net/login%3FcallbackUrl=%252F
  * Node Name: `https://admin-pc.tail8998df.ts.net/login (callbackUrl)`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `<script src="/_next/static/chunks/1fwxhcgd98n4v.js" async="" nonce="MDlkYWEyODMtOGFiYS00YWU3LTg3MmUtNGZmN2Q0ODU4NDk5"></script>`
  * Other Info: `No links have been found while there are scripts, which is an indication that this is a modern web application.`
* URL: https://admin-pc.tail8998df.ts.net/login%3FcallbackUrl=%252F
  * Node Name: `https://admin-pc.tail8998df.ts.net/login (callbackUrl)`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `<script src="/_next/static/chunks/1fwxhcgd98n4v.js" async="" nonce="MGRmMTcyZDAtMmE0YS00OWI1LWJlNTktYzdmYTJmNmRhNjVh"></script>`
  * Other Info: `No links have been found while there are scripts, which is an indication that this is a modern web application.`
* URL: https://admin-pc.tail8998df.ts.net/login%3FcallbackUrl=%252Fsitemap.xml
  * Node Name: `https://admin-pc.tail8998df.ts.net/login (callbackUrl)`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `<script src="/_next/static/chunks/1fwxhcgd98n4v.js" async="" nonce="OGUyZTNhZDQtMzg4OC00NmFkLWExMjYtOWU4ZGJiOWM5ZGE1"></script>`
  * Other Info: `No links have been found while there are scripts, which is an indication that this is a modern web application.`
* URL: https://admin-pc.tail8998df.ts.net/login%3FcallbackUrl=%252Frobots.txt
  * Node Name: `https://admin-pc.tail8998df.ts.net/login (callbackUrl)`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `<script src="/_next/static/chunks/1fwxhcgd98n4v.js" async="" nonce="OTA3MDgyMmEtMjA3NS00NTU0LTkyODAtNWNkMzdkM2RmODBi"></script>`
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
* URL: https://admin-pc.tail8998df.ts.net/_next/static/media/8f46d218c8f79e34-s.p.2wu4yy186g04j.woff2
  * Node Name: `https://admin-pc.tail8998df.ts.net/_next/static/media/8f46d218c8f79e34-s.p.2wu4yy186g04j.woff2`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `max-age=31536000`
  * Other Info: ``
* URL: https://admin-pc.tail8998df.ts.net/_next/static/media/8ffc259da9d23054-s.p.10uaeld2xxvpt.woff2
  * Node Name: `https://admin-pc.tail8998df.ts.net/_next/static/media/8ffc259da9d23054-s.p.10uaeld2xxvpt.woff2`
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


