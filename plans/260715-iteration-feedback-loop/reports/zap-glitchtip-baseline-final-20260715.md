# ZAP Scanning Report

ZAP by [Checkmarx](https://checkmarx.com/).


## Summary of Alerts

| Risk Level | Number of Alerts |
| --- | --- |
| High | 0 |
| Medium | 5 |
| Low | 1 |
| Informational | 3 |




## Insights

| Level | Reason | Site | Description | Statistic |
| --- | --- | --- | --- | --- |
| Info | Informational | https://admin-pc.tail8998df.ts.net:8444 | Percentage of responses with status code 2xx | 80 % |
| Info | Informational | https://admin-pc.tail8998df.ts.net:8444 | Percentage of responses with status code 3xx | 10 % |
| Info | Informational | https://admin-pc.tail8998df.ts.net:8444 | Percentage of responses with status code 4xx | 10 % |
| Info | Informational | https://admin-pc.tail8998df.ts.net:8444 | Percentage of endpoints with content type image/x-icon | 12 % |
| Info | Informational | https://admin-pc.tail8998df.ts.net:8444 | Percentage of endpoints with content type text/css | 12 % |
| Info | Informational | https://admin-pc.tail8998df.ts.net:8444 | Percentage of endpoints with content type text/html | 37 % |
| Info | Informational | https://admin-pc.tail8998df.ts.net:8444 | Percentage of endpoints with content type text/javascript | 25 % |
| Info | Informational | https://admin-pc.tail8998df.ts.net:8444 | Percentage of endpoints with content type text/plain | 12 % |
| Info | Informational | https://admin-pc.tail8998df.ts.net:8444 | Percentage of endpoints with method GET | 100 % |
| Info | Informational | https://admin-pc.tail8998df.ts.net:8444 | Count of total endpoints | 8    |
| Info | Informational | https://admin-pc.tail8998df.ts.net:8444 | Percentage of slow responses | 20 % |







## Alerts

| Name | Risk Level | Number of Instances |
| --- | --- | --- |
| CSP: Failure to Define Directive with No Fallback | Medium | 5 |
| CSP: Wildcard Directive | Medium | 4 |
| CSP: script-src unsafe-inline | Medium | 4 |
| CSP: style-src unsafe-hashes | Medium | 5 |
| CSP: style-src unsafe-inline | Medium | 4 |
| Server Leaks Version Information via "Server" HTTP Response Header Field | Low | Systemic |
| Modern Web Application | Informational | 3 |
| Re-examine Cache-control Directives | Informational | 3 |
| Storable and Cacheable Content | Informational | Systemic |




## Alert Detail



### [ CSP: Failure to Define Directive with No Fallback ](https://www.zaproxy.org/docs/alerts/10055/)



##### Medium (High)

### Description

The Content Security Policy fails to define one of the directives that has no fallback. Missing/excluding them is the same as allowing anything.

* URL: https://admin-pc.tail8998df.ts.net:8444
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self' 'nonce-u3Ewfd09YtqEfaKsKpvcmw'; style-src 'self' 'unsafe-hashes' 'sha256-O8jfeqFksurRugv3Tf3/v0iXnYWvTcfat/0kZ7mOG2E=' 'sha256-oZlTn8ZZ6FfnyCuOZMm7JZJ+338v33CyBc1LECPdidg=' 'sha256-MVw92bfV3jAFhTunVPaVsBxwfM7eXzAE2B7jxQ4R/Hw=' 'nonce-u3Ewfd09YtqEfaKsKpvcmw'; font-src 'self' data:; connect-src 'self'; script-src 'self' 'sha256-iRcDQ27XiXX4k+jbJ8nGeQFBnBOjmII7FdMlixb6QE4=' 'nonce-u3Ewfd09YtqEfaKsKpvcmw'; img-src 'self'; frame-src 'self'`
  * Other Info: `The directive(s): frame-ancestors, form-action is/are among the directives that do not fallback to default-src.`
* URL: https://admin-pc.tail8998df.ts.net:8444/
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444/`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self' 'nonce-B-32pfQhQUHZfXEv07Nd4w'; style-src 'self' 'unsafe-hashes' 'sha256-O8jfeqFksurRugv3Tf3/v0iXnYWvTcfat/0kZ7mOG2E=' 'sha256-oZlTn8ZZ6FfnyCuOZMm7JZJ+338v33CyBc1LECPdidg=' 'sha256-MVw92bfV3jAFhTunVPaVsBxwfM7eXzAE2B7jxQ4R/Hw=' 'nonce-B-32pfQhQUHZfXEv07Nd4w'; font-src 'self' data:; connect-src 'self'; script-src 'self' 'sha256-iRcDQ27XiXX4k+jbJ8nGeQFBnBOjmII7FdMlixb6QE4=' 'nonce-B-32pfQhQUHZfXEv07Nd4w'; img-src 'self'; frame-src 'self'`
  * Other Info: `The directive(s): frame-ancestors, form-action is/are among the directives that do not fallback to default-src.`
* URL: https://admin-pc.tail8998df.ts.net:8444/
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444/`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self' 'nonce-_yva0vkTLnBdlJU3dUmGTQ'; style-src 'self' 'unsafe-hashes' 'sha256-O8jfeqFksurRugv3Tf3/v0iXnYWvTcfat/0kZ7mOG2E=' 'sha256-oZlTn8ZZ6FfnyCuOZMm7JZJ+338v33CyBc1LECPdidg=' 'sha256-MVw92bfV3jAFhTunVPaVsBxwfM7eXzAE2B7jxQ4R/Hw=' 'nonce-_yva0vkTLnBdlJU3dUmGTQ'; font-src 'self' data:; connect-src 'self'; script-src 'self' 'sha256-iRcDQ27XiXX4k+jbJ8nGeQFBnBOjmII7FdMlixb6QE4=' 'nonce-_yva0vkTLnBdlJU3dUmGTQ'; img-src 'self'; frame-src 'self'`
  * Other Info: `The directive(s): frame-ancestors, form-action is/are among the directives that do not fallback to default-src.`
* URL: https://admin-pc.tail8998df.ts.net:8444/favicon.ico
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444/favicon.ico`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self'; style-src 'self' 'unsafe-hashes' 'sha256-O8jfeqFksurRugv3Tf3/v0iXnYWvTcfat/0kZ7mOG2E=' 'sha256-oZlTn8ZZ6FfnyCuOZMm7JZJ+338v33CyBc1LECPdidg=' 'sha256-MVw92bfV3jAFhTunVPaVsBxwfM7eXzAE2B7jxQ4R/Hw='; font-src 'self' data:; connect-src 'self'; script-src 'self' 'sha256-iRcDQ27XiXX4k+jbJ8nGeQFBnBOjmII7FdMlixb6QE4='; img-src 'self'; frame-src 'self'`
  * Other Info: `The directive(s): frame-ancestors, form-action is/are among the directives that do not fallback to default-src.`
* URL: https://admin-pc.tail8998df.ts.net:8444/sitemap.xml
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444/sitemap.xml`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self'; style-src 'self' 'unsafe-hashes' 'sha256-O8jfeqFksurRugv3Tf3/v0iXnYWvTcfat/0kZ7mOG2E=' 'sha256-oZlTn8ZZ6FfnyCuOZMm7JZJ+338v33CyBc1LECPdidg=' 'sha256-MVw92bfV3jAFhTunVPaVsBxwfM7eXzAE2B7jxQ4R/Hw='; font-src 'self' data:; connect-src 'self'; script-src 'self' 'sha256-iRcDQ27XiXX4k+jbJ8nGeQFBnBOjmII7FdMlixb6QE4='; img-src 'self'; frame-src 'self'`
  * Other Info: `The directive(s): frame-ancestors, form-action is/are among the directives that do not fallback to default-src.`


Instances: 5

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

### [ CSP: Wildcard Directive ](https://www.zaproxy.org/docs/alerts/10055/)



##### Medium (High)

### Description

Content Security Policy (CSP) is an added layer of security that helps to detect and mitigate certain types of attacks. Including (but not limited to) Cross Site Scripting (XSS), and data injection attacks. These attacks are used for everything from data theft to site defacement or distribution of malware. CSP provides a set of standard HTTP headers that allow website owners to declare approved sources of content that browsers should be allowed to load on that page — covered types are JavaScript, CSS, HTML frames, fonts, images and embeddable objects such as Java applets, ActiveX, audio and video files.

* URL: https://admin-pc.tail8998df.ts.net:8444
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; worker-src 'self' blob:`
  * Other Info: `The following directives either allow wildcard sources (or ancestors), are not defined, or are overly broadly defined:
script-src, style-src, img-src, connect-src, frame-src, font-src, media-src, manifest-src`
* URL: https://admin-pc.tail8998df.ts.net:8444/
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444/`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; worker-src 'self' blob:`
  * Other Info: `The following directives either allow wildcard sources (or ancestors), are not defined, or are overly broadly defined:
script-src, style-src, img-src, connect-src, frame-src, font-src, media-src, manifest-src`
* URL: https://admin-pc.tail8998df.ts.net:8444/favicon.ico
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444/favicon.ico`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; worker-src 'self' blob:`
  * Other Info: `The following directives either allow wildcard sources (or ancestors), are not defined, or are overly broadly defined:
script-src, style-src, img-src, connect-src, frame-src, font-src, media-src, manifest-src`
* URL: https://admin-pc.tail8998df.ts.net:8444/sitemap.xml
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444/sitemap.xml`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; worker-src 'self' blob:`
  * Other Info: `The following directives either allow wildcard sources (or ancestors), are not defined, or are overly broadly defined:
script-src, style-src, img-src, connect-src, frame-src, font-src, media-src, manifest-src`


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

### [ CSP: script-src unsafe-inline ](https://www.zaproxy.org/docs/alerts/10055/)



##### Medium (High)

### Description

Content Security Policy (CSP) is an added layer of security that helps to detect and mitigate certain types of attacks. Including (but not limited to) Cross Site Scripting (XSS), and data injection attacks. These attacks are used for everything from data theft to site defacement or distribution of malware. CSP provides a set of standard HTTP headers that allow website owners to declare approved sources of content that browsers should be allowed to load on that page — covered types are JavaScript, CSS, HTML frames, fonts, images and embeddable objects such as Java applets, ActiveX, audio and video files.

* URL: https://admin-pc.tail8998df.ts.net:8444
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; worker-src 'self' blob:`
  * Other Info: `script-src includes unsafe-inline.`
* URL: https://admin-pc.tail8998df.ts.net:8444/
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444/`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; worker-src 'self' blob:`
  * Other Info: `script-src includes unsafe-inline.`
* URL: https://admin-pc.tail8998df.ts.net:8444/favicon.ico
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444/favicon.ico`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; worker-src 'self' blob:`
  * Other Info: `script-src includes unsafe-inline.`
* URL: https://admin-pc.tail8998df.ts.net:8444/sitemap.xml
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444/sitemap.xml`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; worker-src 'self' blob:`
  * Other Info: `script-src includes unsafe-inline.`


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

### [ CSP: style-src unsafe-hashes ](https://www.zaproxy.org/docs/alerts/10055/)



##### Medium (High)

### Description

Content Security Policy (CSP) is an added layer of security that helps to detect and mitigate certain types of attacks. Including (but not limited to) Cross Site Scripting (XSS), and data injection attacks. These attacks are used for everything from data theft to site defacement or distribution of malware. CSP provides a set of standard HTTP headers that allow website owners to declare approved sources of content that browsers should be allowed to load on that page — covered types are JavaScript, CSS, HTML frames, fonts, images and embeddable objects such as Java applets, ActiveX, audio and video files.

* URL: https://admin-pc.tail8998df.ts.net:8444
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self' 'nonce-u3Ewfd09YtqEfaKsKpvcmw'; style-src 'self' 'unsafe-hashes' 'sha256-O8jfeqFksurRugv3Tf3/v0iXnYWvTcfat/0kZ7mOG2E=' 'sha256-oZlTn8ZZ6FfnyCuOZMm7JZJ+338v33CyBc1LECPdidg=' 'sha256-MVw92bfV3jAFhTunVPaVsBxwfM7eXzAE2B7jxQ4R/Hw=' 'nonce-u3Ewfd09YtqEfaKsKpvcmw'; font-src 'self' data:; connect-src 'self'; script-src 'self' 'sha256-iRcDQ27XiXX4k+jbJ8nGeQFBnBOjmII7FdMlixb6QE4=' 'nonce-u3Ewfd09YtqEfaKsKpvcmw'; img-src 'self'; frame-src 'self'`
  * Other Info: `style-src includes unsafe-hashes, an attacker will be able to use any of the code covered by such hashes.`
* URL: https://admin-pc.tail8998df.ts.net:8444/
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444/`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self' 'nonce-B-32pfQhQUHZfXEv07Nd4w'; style-src 'self' 'unsafe-hashes' 'sha256-O8jfeqFksurRugv3Tf3/v0iXnYWvTcfat/0kZ7mOG2E=' 'sha256-oZlTn8ZZ6FfnyCuOZMm7JZJ+338v33CyBc1LECPdidg=' 'sha256-MVw92bfV3jAFhTunVPaVsBxwfM7eXzAE2B7jxQ4R/Hw=' 'nonce-B-32pfQhQUHZfXEv07Nd4w'; font-src 'self' data:; connect-src 'self'; script-src 'self' 'sha256-iRcDQ27XiXX4k+jbJ8nGeQFBnBOjmII7FdMlixb6QE4=' 'nonce-B-32pfQhQUHZfXEv07Nd4w'; img-src 'self'; frame-src 'self'`
  * Other Info: `style-src includes unsafe-hashes, an attacker will be able to use any of the code covered by such hashes.`
* URL: https://admin-pc.tail8998df.ts.net:8444/
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444/`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self' 'nonce-_yva0vkTLnBdlJU3dUmGTQ'; style-src 'self' 'unsafe-hashes' 'sha256-O8jfeqFksurRugv3Tf3/v0iXnYWvTcfat/0kZ7mOG2E=' 'sha256-oZlTn8ZZ6FfnyCuOZMm7JZJ+338v33CyBc1LECPdidg=' 'sha256-MVw92bfV3jAFhTunVPaVsBxwfM7eXzAE2B7jxQ4R/Hw=' 'nonce-_yva0vkTLnBdlJU3dUmGTQ'; font-src 'self' data:; connect-src 'self'; script-src 'self' 'sha256-iRcDQ27XiXX4k+jbJ8nGeQFBnBOjmII7FdMlixb6QE4=' 'nonce-_yva0vkTLnBdlJU3dUmGTQ'; img-src 'self'; frame-src 'self'`
  * Other Info: `style-src includes unsafe-hashes, an attacker will be able to use any of the code covered by such hashes.`
* URL: https://admin-pc.tail8998df.ts.net:8444/favicon.ico
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444/favicon.ico`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self'; style-src 'self' 'unsafe-hashes' 'sha256-O8jfeqFksurRugv3Tf3/v0iXnYWvTcfat/0kZ7mOG2E=' 'sha256-oZlTn8ZZ6FfnyCuOZMm7JZJ+338v33CyBc1LECPdidg=' 'sha256-MVw92bfV3jAFhTunVPaVsBxwfM7eXzAE2B7jxQ4R/Hw='; font-src 'self' data:; connect-src 'self'; script-src 'self' 'sha256-iRcDQ27XiXX4k+jbJ8nGeQFBnBOjmII7FdMlixb6QE4='; img-src 'self'; frame-src 'self'`
  * Other Info: `style-src includes unsafe-hashes, an attacker will be able to use any of the code covered by such hashes.`
* URL: https://admin-pc.tail8998df.ts.net:8444/sitemap.xml
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444/sitemap.xml`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self'; style-src 'self' 'unsafe-hashes' 'sha256-O8jfeqFksurRugv3Tf3/v0iXnYWvTcfat/0kZ7mOG2E=' 'sha256-oZlTn8ZZ6FfnyCuOZMm7JZJ+338v33CyBc1LECPdidg=' 'sha256-MVw92bfV3jAFhTunVPaVsBxwfM7eXzAE2B7jxQ4R/Hw='; font-src 'self' data:; connect-src 'self'; script-src 'self' 'sha256-iRcDQ27XiXX4k+jbJ8nGeQFBnBOjmII7FdMlixb6QE4='; img-src 'self'; frame-src 'self'`
  * Other Info: `style-src includes unsafe-hashes, an attacker will be able to use any of the code covered by such hashes.`


Instances: 5

### Solution

Ensure that your web server, application server, load balancer, etc. is properly configured to set the Content-Security-Policy header.

### Reference


* [ https://www.w3.org/TR/CSP3/#unsafe-hashes-usage ](https://www.w3.org/TR/CSP3/#unsafe-hashes-usage)
* [ https://content-security-policy.com/examples/allow-inline-style/ ](https://content-security-policy.com/examples/allow-inline-style/)


#### CWE Id: [ 693 ](https://cwe.mitre.org/data/definitions/693.html)


#### WASC Id: 15

#### Source ID: 3

### [ CSP: style-src unsafe-inline ](https://www.zaproxy.org/docs/alerts/10055/)



##### Medium (High)

### Description

Content Security Policy (CSP) is an added layer of security that helps to detect and mitigate certain types of attacks. Including (but not limited to) Cross Site Scripting (XSS), and data injection attacks. These attacks are used for everything from data theft to site defacement or distribution of malware. CSP provides a set of standard HTTP headers that allow website owners to declare approved sources of content that browsers should be allowed to load on that page — covered types are JavaScript, CSS, HTML frames, fonts, images and embeddable objects such as Java applets, ActiveX, audio and video files.

* URL: https://admin-pc.tail8998df.ts.net:8444
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; worker-src 'self' blob:`
  * Other Info: `style-src includes unsafe-inline.`
* URL: https://admin-pc.tail8998df.ts.net:8444/
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444/`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; worker-src 'self' blob:`
  * Other Info: `style-src includes unsafe-inline.`
* URL: https://admin-pc.tail8998df.ts.net:8444/favicon.ico
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444/favicon.ico`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; worker-src 'self' blob:`
  * Other Info: `style-src includes unsafe-inline.`
* URL: https://admin-pc.tail8998df.ts.net:8444/sitemap.xml
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444/sitemap.xml`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; worker-src 'self' blob:`
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

### [ Server Leaks Version Information via "Server" HTTP Response Header Field ](https://www.zaproxy.org/docs/alerts/10036/)



##### Low (High)

### Description

The web/application server is leaking version information via the "Server" HTTP response header. Access to such information may facilitate attackers identifying other vulnerabilities your web/application server is subject to.

* URL: https://admin-pc.tail8998df.ts.net:8444/
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444/`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `nginx/1.29.8`
  * Other Info: ``
* URL: https://admin-pc.tail8998df.ts.net:8444/favicon.ico
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444/favicon.ico`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `nginx/1.29.8`
  * Other Info: ``
* URL: https://admin-pc.tail8998df.ts.net:8444/robots.txt
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444/robots.txt`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `nginx/1.29.8`
  * Other Info: ``
* URL: https://admin-pc.tail8998df.ts.net:8444/static/favicon.ico
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444/static/favicon.ico`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `nginx/1.29.8`
  * Other Info: ``
* URL: https://admin-pc.tail8998df.ts.net:8444/static/styles-UU4ALEEH.css
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444/static/styles-UU4ALEEH.css`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `nginx/1.29.8`
  * Other Info: ``

Instances: Systemic


### Solution

Ensure that your web server, application server, load balancer, etc. is configured to suppress the "Server" header or provide generic details.

### Reference


* [ https://httpd.apache.org/docs/current/mod/core.html#servertokens ](https://httpd.apache.org/docs/current/mod/core.html#servertokens)
* [ https://learn.microsoft.com/en-us/previous-versions/msp-n-p/ff648552(v=pandp.10) ](https://learn.microsoft.com/en-us/previous-versions/msp-n-p/ff648552(v=pandp.10))
* [ https://www.troyhunt.com/shhh-dont-let-your-response-headers/ ](https://www.troyhunt.com/shhh-dont-let-your-response-headers/)


#### CWE Id: [ 497 ](https://cwe.mitre.org/data/definitions/497.html)


#### WASC Id: 13

#### Source ID: 3

### [ Modern Web Application ](https://www.zaproxy.org/docs/alerts/10109/)



##### Informational (Medium)

### Description

The application appears to be a modern web application. If you need to explore it automatically then the Client Spider may well be more effective than the standard one.

* URL: https://admin-pc.tail8998df.ts.net:8444
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `<script nonce="u3Ewfd09YtqEfaKsKpvcmw">
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
* URL: https://admin-pc.tail8998df.ts.net:8444/
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444/`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `<script nonce="B-32pfQhQUHZfXEv07Nd4w">
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
* URL: https://admin-pc.tail8998df.ts.net:8444/
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444/`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `<script nonce="_yva0vkTLnBdlJU3dUmGTQ">
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


Instances: 3

### Solution

This is an informational alert and so no changes are required.

### Reference




#### Source ID: 3

### [ Re-examine Cache-control Directives ](https://www.zaproxy.org/docs/alerts/10015/)



##### Informational (Low)

### Description

The cache-control header has not been set properly or is missing, allowing the browser and proxies to cache content. For static assets like css, js, or image files this might be intended, however, the resources should be reviewed to ensure that no sensitive content will be cached.

* URL: https://admin-pc.tail8998df.ts.net:8444
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444`
  * Method: `GET`
  * Parameter: `cache-control`
  * Attack: ``
  * Evidence: ``
  * Other Info: ``
* URL: https://admin-pc.tail8998df.ts.net:8444/
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444/`
  * Method: `GET`
  * Parameter: `cache-control`
  * Attack: ``
  * Evidence: ``
  * Other Info: ``
* URL: https://admin-pc.tail8998df.ts.net:8444/robots.txt
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444/robots.txt`
  * Method: `GET`
  * Parameter: `cache-control`
  * Attack: ``
  * Evidence: ``
  * Other Info: ``


Instances: 3

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

* URL: https://admin-pc.tail8998df.ts.net:8444/
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444/`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: ``
  * Other Info: `In the absence of an explicitly specified caching lifetime directive in the response, a liberal lifetime heuristic of 1 year was assumed. This is permitted by rfc7234.`
* URL: https://admin-pc.tail8998df.ts.net:8444/favicon.ico
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444/favicon.ico`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: ``
  * Other Info: `In the absence of an explicitly specified caching lifetime directive in the response, a liberal lifetime heuristic of 1 year was assumed. This is permitted by rfc7234.`
* URL: https://admin-pc.tail8998df.ts.net:8444/robots.txt
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444/robots.txt`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: ``
  * Other Info: `In the absence of an explicitly specified caching lifetime directive in the response, a liberal lifetime heuristic of 1 year was assumed. This is permitted by rfc7234.`
* URL: https://admin-pc.tail8998df.ts.net:8444/static/favicon.ico
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444/static/favicon.ico`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `max-age=86400`
  * Other Info: ``
* URL: https://admin-pc.tail8998df.ts.net:8444/static/styles-UU4ALEEH.css
  * Node Name: `https://admin-pc.tail8998df.ts.net:8444/static/styles-UU4ALEEH.css`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `max-age=86400`
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


