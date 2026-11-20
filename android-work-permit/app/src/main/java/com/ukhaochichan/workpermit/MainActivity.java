package com.ukhaochichan.workpermit;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.OutputStream;
import java.util.Locale;

public class MainActivity extends Activity {
    private static final int FILE_CHOOSER_REQUEST = 4102;
    private static final String HOME = "https://sirkan08-afk.github.io/Contactor-visitor/work-permit/";
    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        webView = new WebView(this);
        setContentView(webView);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setSupportMultipleWindows(false);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);
        webView.addJavascriptInterface(new NativeFileBridge(), "AndroidFileBridge");

        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String host = uri.getHost() == null ? "" : uri.getHost();
                if ("sirkan08-afk.github.io".equals(host) || "challenges.cloudflare.com".equals(host)
                    || host.endsWith(".supabase.co") || "supabase.co".equals(host)) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) {}
                return true;
            }

            @Override public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                // PDF exports may call this bridge directly with the permit-specific filename.
                // Keep blob fallback support for any other generated document downloads.
                String script = "(function(){if(window.__wpNativePdfHook)return;window.__wpNativePdfHook=true;" +
                    "document.addEventListener('click',function(e){" +
                    "var a=e.target&&e.target.closest?e.target.closest('a[download]'):null;" +
                    "if(!a||!a.href||a.href.indexOf('blob:')!==0)return;" +
                    "e.preventDefault();e.stopImmediatePropagation();" +
                    "var u=a.href,n=a.getAttribute('download')||'WorkPermit.pdf';" +
                    "fetch(u).then(function(r){return r.blob()}).then(function(b){" +
                    "var fr=new FileReader();fr.onloadend=function(){" +
                    "var s=String(fr.result).split(',')[1]||'';" +
                    "window.AndroidFileBridge.saveBase64File(s,b.type||'application/pdf',n);" +
                    "};fr.readAsDataURL(b);" +
                    "}).catch(function(){window.AndroidFileBridge.showDownloadError();});" +
                    "},true);})();";
                view.evaluateJavascript(script, null);
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent intent = params.createIntent();
                try { startActivityForResult(intent, FILE_CHOOSER_REQUEST); }
                catch (Exception e) { fileCallback = null; callback.onReceiveValue(null); return false; }
                return true;
            }
        });

        webView.setDownloadListener((url, agent, disposition, mime, length) -> {
            try {
                if (url != null && url.startsWith("blob:")) {
                    String safeUrl = url.replace("\\", "\\\\").replace("'", "\\'");
                    webView.evaluateJavascript("(function(u){fetch(u).then(r=>r.blob()).then(b=>{var f=new FileReader();f.onloadend=()=>AndroidFileBridge.saveBase64File(String(f.result).split(',')[1],b.type||'application/pdf','WorkPermit.pdf');f.readAsDataURL(b);}).catch(()=>AndroidFileBridge.showDownloadError());})('" + safeUrl + "')", null);
                    return;
                }
                DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                String cookie = CookieManager.getInstance().getCookie(url);
                if (cookie != null) request.addRequestHeader("Cookie", cookie);
                if (mime != null) request.setMimeType(mime);
                request.setTitle("Work Permit document");
                request.setDescription("Downloading document");
                request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "WorkPermit-" + System.currentTimeMillis());
                ((DownloadManager)getSystemService(DOWNLOAD_SERVICE)).enqueue(request);
                Toast.makeText(this, "เริ่มดาวน์โหลดเอกสาร", Toast.LENGTH_SHORT).show();
            } catch (Exception e) { Toast.makeText(this, "ไม่สามารถดาวน์โหลดไฟล์ได้", Toast.LENGTH_LONG).show(); }
        });
        if (state == null) webView.loadUrl(HOME); else webView.restoreState(state);
    }

    private class NativeFileBridge {
        @JavascriptInterface public void saveBase64File(String base64, String mimeType, String requestedName) {
            runOnUiThread(() -> {
                try {
                    byte[] bytes = android.util.Base64.decode(base64, android.util.Base64.DEFAULT);
                    String name = requestedName == null ? "WorkPermit.pdf" : requestedName.replaceAll("[^a-zA-Z0-9._-]", "_");
                    if (!name.toLowerCase(Locale.ROOT).endsWith(".pdf")) name += ".pdf";
                    if (Build.VERSION.SDK_INT >= 29) {
                        ContentValues values = new ContentValues();
                        values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                        values.put(MediaStore.MediaColumns.MIME_TYPE, "application/pdf");
                        values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                        values.put(MediaStore.MediaColumns.IS_PENDING, 1);
                        Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                        if (uri == null) throw new Exception("Cannot create download file");
                        try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                            if (out == null) throw new Exception("Cannot open download file");
                            out.write(bytes);
                            out.flush();
                        }
                        values.clear();
                        values.put(MediaStore.MediaColumns.IS_PENDING, 0);
                        getContentResolver().update(uri, values, null, null);
                    } else {
                        java.io.File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                        if (!dir.exists()) dir.mkdirs();
                        try (java.io.FileOutputStream out = new java.io.FileOutputStream(new java.io.File(dir, name))) {
                            out.write(bytes);
                        }
                    }
                    Toast.makeText(MainActivity.this, "บันทึก PDF ในโฟลเดอร์ Downloads แล้ว", Toast.LENGTH_LONG).show();
                } catch (Exception e) {
                    Toast.makeText(MainActivity.this, "บันทึก PDF ไม่สำเร็จ: " + e.getMessage(), Toast.LENGTH_LONG).show();
                }
            });
        }
        @JavascriptInterface public void showDownloadError() {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, "ไม่สามารถสร้างไฟล์ PDF ได้ กรุณาลองอีกครั้ง", Toast.LENGTH_LONG).show());
        }
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQUEST && fileCallback != null) {
            Uri[] result = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            fileCallback.onReceiveValue(result);
            fileCallback = null;
        }
    }
    @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); if (webView != null) webView.saveState(out); }
    @Override public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack(); else super.onBackPressed();
    }
    @Override protected void onDestroy() {
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        if (webView != null) { webView.destroy(); webView = null; }
        super.onDestroy();
    }
}
