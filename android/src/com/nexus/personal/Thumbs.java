package com.nexus.personal;

import android.util.Base64;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Finds the preview picture of a page the user saved (its og:image) and returns it as a data URL.
 * Same rules as Titles: http and https only, never a private address, a few redirects, small downloads.
 */
final class Thumbs {
    private Thumbs() {}

    private static final Pattern IMG1 = Pattern.compile("<meta[^>]+(?:property|name)=[\"'](?:og:image|og:image:url|twitter:image)[\"'][^>]*content=[\"']([^\"']+)[\"']", Pattern.CASE_INSENSITIVE);
    private static final Pattern IMG2 = Pattern.compile("<meta[^>]+content=[\"']([^\"']+)[\"'][^>]*(?:property|name)=[\"'](?:og:image|og:image:url|twitter:image)[\"']", Pattern.CASE_INSENSITIVE);
    private static final int MAX_IMAGE = 600 * 1024;

    /** The picture as a data URL, or an empty string when there is none or anything goes wrong. */
    static String fetch(String address) {
        try {
            URL[] at = new URL[1];
            byte[] page = get(new URL(address), "text/html", 98304, false, at, null);
            if (page == null) return "";
            String html = new String(page, "UTF-8");
            Matcher m = IMG1.matcher(html);
            String src = m.find() ? m.group(1) : null;
            if (src == null) {
                m = IMG2.matcher(html);
                if (m.find()) src = m.group(1);
            }
            if (src == null) return "";
            src = src.replace("&amp;", "&").trim();
            URL img = new URL(at[0], src);
            String[] type = new String[1];
            byte[] b = get(img, "image/*", MAX_IMAGE, true, null, type);
            if (b == null || b.length < 100 || type[0] == null) return "";
            return "data:" + type[0] + ";base64," + Base64.encodeToString(b, Base64.NO_WRAP);
        } catch (Exception e) {
            return "";
        }
    }

    /**
     * One safe download. wantImage: the answer must be a bitmap (not SVG). A body larger than max is refused
     * for images and cut short for pages. finalUrl receives the address after redirects.
     */
    private static byte[] get(URL url, String accept, int max, boolean wantImage, URL[] finalUrl, String[] typeOut) {
        try {
            for (int hop = 0; hop < 4; hop++) {
                String p = url.getProtocol();
                if (!"https".equals(p) && !"http".equals(p)) return null;
                if (url.getUserInfo() != null || !Titles.publicHost(url.getHost())) return null;
                HttpURLConnection c = (HttpURLConnection) url.openConnection();
                c.setInstanceFollowRedirects(false);
                c.setConnectTimeout(6000);
                c.setReadTimeout(8000);
                c.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14) Nexus");
                c.setRequestProperty("Accept", accept);
                int code = c.getResponseCode();
                if (code >= 300 && code < 400) {
                    String loc = c.getHeaderField("Location");
                    c.disconnect();
                    if (loc == null) return null;
                    url = new URL(url, loc);
                    continue;
                }
                if (code != 200) {
                    c.disconnect();
                    return null;
                }
                String type = c.getContentType();
                String t = type == null ? "" : type.toLowerCase().split(";")[0].trim();
                if (wantImage) {
                    if (!t.startsWith("image/") || t.contains("svg")) {
                        c.disconnect();
                        return null;
                    }
                    if (c.getContentLength() > max) {
                        c.disconnect();
                        return null;
                    }
                } else if (t.length() > 0 && !t.contains("html")) {
                    c.disconnect();
                    return null;
                }
                InputStream in = c.getInputStream();
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) {
                    out.write(buf, 0, n);
                    if (out.size() > max) {
                        if (wantImage) {
                            in.close();
                            c.disconnect();
                            return null;
                        }
                        break;
                    }
                }
                in.close();
                c.disconnect();
                if (finalUrl != null) finalUrl[0] = url;
                if (typeOut != null) typeOut[0] = t;
                return out.toByteArray();
            }
        } catch (Exception e) {
            // no network, bad address, timeout: no picture
        }
        return null;
    }
}
