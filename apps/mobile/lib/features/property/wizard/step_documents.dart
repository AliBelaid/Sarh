import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../../app/router.dart';
import '../../../core/theme/sijilli_colors.dart';
import 'wizard_state.dart';

const _docTypes = <String, String>{
  'koreky_certificate': 'شهادة كوريكي',
  'survey_certificate': 'شهادة مساحة',
  'sale_contract': 'عقد بيع',
  'inheritance_deed': 'إفادة وراثة',
  'court_order': 'قرار محكمة',
  'site_photo': 'صورة موقع',
  'boundary_map': 'خريطة الحدود',
  'other': 'أخرى',
};

class WizardStepDocuments extends ConsumerStatefulWidget {
  const WizardStepDocuments({super.key});
  @override
  ConsumerState<WizardStepDocuments> createState() => _WizardStepDocumentsState();
}

class _WizardStepDocumentsState extends ConsumerState<WizardStepDocuments> {
  String _docType = 'site_photo';

  Future<void> _pickFromGallery() async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(source: ImageSource.gallery);
    if (picked != null) {
      ref.read(wizardStateProvider.notifier).addDocument(
            PickedDocument(path: picked.path, documentType: _docType),
          );
    }
  }

  Future<void> _pickFromCamera() async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(source: ImageSource.camera);
    if (picked != null) {
      ref.read(wizardStateProvider.notifier).addDocument(
            PickedDocument(path: picked.path, documentType: _docType),
          );
    }
  }

  Future<void> _pickFile() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['pdf', 'jpg', 'jpeg', 'png'],
    );
    final file = result?.files.singleOrNull?.path;
    if (file != null) {
      ref.read(wizardStateProvider.notifier).addDocument(
            PickedDocument(path: file, documentType: _docType),
          );
    }
  }

  @override
  Widget build(BuildContext context) {
    final docs = ref.watch(wizardStateProvider).documents;
    return Scaffold(
      appBar: AppBar(title: const Text('المستندات')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('4 / 5 — أرفق المستندات الداعمة',
              style: Theme.of(context).textTheme.bodyMedium),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            value: _docType,
            decoration: const InputDecoration(labelText: 'نوع المستند'),
            items: _docTypes.entries
                .map((e) => DropdownMenuItem(value: e.key, child: Text(e.value)))
                .toList(),
            onChanged: (v) => setState(() => _docType = v ?? _docType),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  icon: const Icon(Icons.camera_alt_outlined),
                  label: const Text('كاميرا'),
                  onPressed: _pickFromCamera,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  icon: const Icon(Icons.photo_library_outlined),
                  label: const Text('معرض الصور'),
                  onPressed: _pickFromGallery,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            icon: const Icon(Icons.attach_file_outlined),
            label: const Text('ملف PDF'),
            onPressed: _pickFile,
          ),
          const SizedBox(height: 16),
          if (docs.isEmpty)
            const Card(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: Text('لم تُرفق أي مستندات بعد.',
                    style: TextStyle(color: SijilliColors.outline)),
              ),
            ),
          for (var i = 0; i < docs.length; i++)
            Card(
              child: ListTile(
                leading: const Icon(Icons.insert_drive_file_outlined),
                title: Text(_docTypes[docs[i].documentType] ?? docs[i].documentType),
                subtitle: Text(
                  docs[i].path.split(RegExp(r'[\\/]')).last,
                  textDirection: TextDirection.ltr,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                trailing: IconButton(
                  icon: const Icon(Icons.delete_outline, color: SijilliColors.warn),
                  onPressed: () =>
                      ref.read(wizardStateProvider.notifier).removeDocument(i),
                ),
              ),
            ),
          const SizedBox(height: 24),
          ElevatedButton(
            onPressed: () => context.push(AppRoutes.wizardReview),
            child: const Text('التالي'),
          ),
        ],
      ),
    );
  }
}
