package com.nexus.personal;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.URL;
import java.nio.charset.Charset;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Reads the title of a web page the user saved. Only http and https, never a private address, a few redirects, a small download. */
final class Titles {
    private Titles() {}

    private static final Pattern OG = Pattern.compile("<meta[^>]+property=[\"']og:title[\"'][^>]*content=[\"']([^\"']+)[\"']", Pattern.CASE_INSENSITIVE);
    private static final Pattern OG2 = Pattern.compile("<meta[^>]+content=[\"']([^\"']+)[\"'][^>]*property=[\"']og:title[\"']", Pattern.CASE_INSENSITIVE);
    private static final Pattern TITLE = Pattern.compile("<title[^>]*>(.*?)</title>", Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
    private static final Pattern CHARSET = Pattern.compile("charset=([\\w-]+)", Pattern.CASE_INSENSITIVE);

    static boolean publicHost(String host) {
        try {
            for (InetAddress a : InetAddress.getAllByName(host)) {
                if (a.isAnyLocalAddress() || a.isLoopbackAddress() || a.isLinkLocalAddress() || a.isSiteLocalAddress() || a.isMulticastAddress()) return false;
                byte[] b = a.getAddress();
                if (b.length == 16 && (b[0] & 0xFE) == 0xFC) return false; // fc00::/7
                if (b.length == 4 && (b[0] & 0xFF) == 100 && (b[1] & 0xC0) == 64) return false; // 100.64.0.0/10
            }
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /** Returns the page title, or an empty string when there is none or anything goes wrong. */
    static String fetch(String address) {
        try {
            URL url = new URL(address);
            for (int hop = 0; hop < 4; hop++) {
                String p = url.getProtocol();
                if (!"https".equals(p) && !"http".equals(p)) return "";
                if (url.getUserInfo() != null || !publicHost(url.getHost())) return "";
                HttpURLConnection c = (HttpURLConnection) url.openConnection();
                c.setInstanceFollowRedirects(false);
                c.setConnectTimeout(6000);
                c.setReadTimeout(6000);
                c.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14) Nexus");
                c.setRequestProperty("Accept", "text/html");
                int code = c.getResponseCode();
                if (code >= 300 && code < 400) {
                    String loc = c.getHeaderField("Location");
                    c.disconnect();
                    if (loc == null) return "";
                    url = new URL(url, loc);
                    continue;
                }
                if (code != 200) { c.disconnect(); return ""; }
                String type = c.getContentType();
                if (type != null && !type.toLowerCase().contains("html")) { c.disconnect(); return ""; }
                Charset cs = Charset.forName("UTF-8");
                if (type != null) {
                    Matcher m = CHARSET.matcher(type);
                    if (m.find()) { try { cs = Charset.forName(m.group(1)); } catch (Exception e) { /* keep UTF-8 */ } }
                }
                InputStream in = c.getInputStream();
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int n;
                while (out.size() < 98304 && (n = in.read(buf)) > 0) out.write(buf, 0, n);
                in.close();
                c.disconnect();
                return pick(new String(out.toByteArray(), cs));
            }
        } catch (Exception e) {
            // no network, bad address, timeout: no title
        }
        return "";
    }

    static String pick(String html) {
        String t = null;
        Matcher m = OG.matcher(html);
        if (m.find()) t = m.group(1);
        if (t == null) { m = OG2.matcher(html); if (m.find()) t = m.group(1); }
        if (t == null) { m = TITLE.matcher(html); if (m.find()) t = m.group(1); }
        if (t == null) return "";
        t = t.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&#39;", "'").replace("&apos;", "'").replace("&nbsp;", " ");
        t = t.replaceAll("&#(\\d{1,5});", " ").replaceAll("\\s+", " ").trim();
        return t.length() > 200 ? t.substring(0, 200) : t;
    }
}
