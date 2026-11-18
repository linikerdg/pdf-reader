package expo.modules.pdfscanner

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.provider.OpenableColumns
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/**
 * Lista os PDFs do armazenamento do aparelho usando o índice do MediaStore.
 *
 * No Android 11+ (API 30) o MediaStore só devolve documentos de outros apps quando
 * o app tem "acesso a todos os arquivos" (MANAGE_EXTERNAL_STORAGE); antes disso
 * basta READ_EXTERNAL_STORAGE.
 */
class PdfScannerModule : Module() {
  private val context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("PdfScanner")

    Function("hasStorageAccess") {
      hasAccess()
    }

    // Abre a tela do sistema onde o usuário concede o acesso. O app volta ao
    // primeiro plano quando o usuário sai dela; o JS checa de novo nesse momento.
    Function("requestStorageAccess") {
      val ctx = context
      val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        Intent(
          Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
          Uri.parse("package:${ctx.packageName}")
        )
      } else {
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${ctx.packageName}"))
      }
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      try {
        ctx.startActivity(intent)
      } catch (_: Exception) {
        // Alguns fabricantes não têm a tela por app; cai para a lista geral.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
          ctx.startActivity(
            Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION)
              .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          )
        }
      }
    }

    AsyncFunction("listPdfs") {
      if (!hasAccess()) return@AsyncFunction emptyList<Map<String, Any?>>()
      queryPdfs()
    }

    // Nome "de verdade" de um content:// recebido via "Abrir com".
    Function("getDisplayName") { uri: String ->
      val parsed = Uri.parse(uri)
      if (parsed.scheme == "file") return@Function parsed.lastPathSegment
      try {
        context.contentResolver.query(
          parsed, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null
        )?.use { c -> if (c.moveToFirst()) c.getString(0) else null }
      } catch (_: Exception) {
        null
      }
    }
  }

  private fun hasAccess(): Boolean {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      Environment.isExternalStorageManager()
    } else {
      context.checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE) ==
        PackageManager.PERMISSION_GRANTED
    }
  }

  @Suppress("DEPRECATION") // DATA é a forma de obter o caminho real, válida com acesso total
  private fun queryPdfs(): List<Map<String, Any?>> {
    val collection = MediaStore.Files.getContentUri("external")
    val projection = arrayOf(
      MediaStore.Files.FileColumns.DATA,
      MediaStore.Files.FileColumns.DISPLAY_NAME,
      MediaStore.Files.FileColumns.SIZE,
      MediaStore.Files.FileColumns.DATE_MODIFIED
    )
    val selection = "${MediaStore.Files.FileColumns.MIME_TYPE} = ? OR " +
      "LOWER(${MediaStore.Files.FileColumns.DATA}) LIKE ?"
    val args = arrayOf("application/pdf", "%.pdf")
    val order = "${MediaStore.Files.FileColumns.DATE_MODIFIED} DESC"

    val result = mutableListOf<Map<String, Any?>>()
    val seen = HashSet<String>()
    context.contentResolver.query(collection, projection, selection, args, order)?.use { c ->
      val dataCol = c.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DATA)
      val nameCol = c.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DISPLAY_NAME)
      val sizeCol = c.getColumnIndexOrThrow(MediaStore.Files.FileColumns.SIZE)
      val dateCol = c.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DATE_MODIFIED)
      while (c.moveToNext()) {
        val path = c.getString(dataCol) ?: continue
        if (!seen.add(path)) continue
        val file = File(path)
        if (!file.isFile) continue // índice desatualizado (arquivo apagado)
        result.add(
          mapOf(
            "path" to path,
            "uri" to Uri.fromFile(file).toString(),
            "name" to (c.getString(nameCol) ?: file.name),
            "size" to c.getLong(sizeCol).toDouble(),
            "modifiedAt" to c.getLong(dateCol).toDouble() * 1000.0,
            "folder" to (file.parentFile?.name ?: "")
          )
        )
      }
    }
    return result
  }
}
